import { env } from "@/lib/config/env";
import type { Db } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { agentLabel, kindLabel } from "./labels";

/**
 * Agent runs for a campaign, read from agent_run_logs. A run is written as
 * `running` when it starts and updated when it ends; a `running` row older
 * than its timeout plus a margin is reported as `stale` (the server died
 * mid-run), so nothing spins forever.
 */

/** Statuses as shown: stored ones plus the derived `stale`. */
export type RunStatus = "running" | "stale" | "ok" | "error" | "timeout" | "fallback" | "skipped";

export interface RunSummary {
  id: string;
  agent: string | null;
  agent_label: string;
  kind: string;
  /** plain-language task, e.g. "Writing the sales plan" */
  task: string;
  source: string;
  status: RunStatus;
  started_at: string;
  /** null while running (or stale) */
  finished_at: string | null;
  duration_ms: number | null;
  error: string | null;
}

export interface RunDetail extends RunSummary {
  hermes_session_id: string | null;
  model: string | null;
  input_preview: string | null;
  output_text: string | null;
  created_at: string;
}

export interface LiveRuns {
  /** server clock, so live timers are not skewed by the browser's */
  now: string;
  running: RunSummary[];
  recent: RunSummary[];
}

export interface StoredRun {
  id: string;
  agent: string | null;
  kind: string;
  source: string;
  status: string;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
}

const SUMMARY_COLUMNS = "id, agent, kind, source, status, duration_ms, error, created_at, meta";
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, hermes_session_id, model, input_preview, output_text`;
const STALE_MARGIN_MS = 60_000;

/** How long a `running` row may stay running before it is reported stale. */
export function staleAfterMs(
  meta: Record<string, unknown> | null,
  hermesTimeoutMs: number,
): number {
  const own = Number(meta?.timeout_ms);
  return Math.max(Number.isFinite(own) ? own : 0, hermesTimeoutMs * 3) + STALE_MARGIN_MS;
}

/** One stored row → the founder-facing summary, deriving start time and `stale`. */
export function summarizeRun(row: StoredRun, now: number, hermesTimeoutMs: number): RunSummary {
  const created = Date.parse(row.created_at);
  const live = row.meta?.live === true || row.status === "running";
  // Rows written at start carry the start time; rows logged only at the end carry the end time.
  const startedMs = live || row.duration_ms == null ? created : created - row.duration_ms;
  let status = row.status as RunStatus;
  if (status === "running" && now - startedMs > staleAfterMs(row.meta, hermesTimeoutMs))
    status = "stale";
  const finished = status !== "running" && status !== "stale" && row.duration_ms != null;
  return {
    id: row.id,
    agent: row.agent,
    agent_label: agentLabel(row.agent),
    kind: row.kind,
    task: kindLabel(row.kind),
    source: row.source,
    status,
    started_at: new Date(startedMs).toISOString(),
    finished_at: finished ? new Date(startedMs + row.duration_ms!).toISOString() : null,
    duration_ms: status === "running" || status === "stale" ? null : row.duration_ms,
    error:
      status === "stale"
        ? "This run never reported back — Kami may have restarted while it ran."
        : row.error,
  };
}

function fail(message: string): never {
  throw new AppError("internal", `could not read agent runs: ${message}`);
}

/** Runs in flight plus the latest finished ones — cheap enough to poll every few seconds. */
export async function liveRuns(
  db: Db,
  sessionId: string,
  recentLimit = 8,
  nowMs = Date.now(),
): Promise<LiveRuns> {
  const timeout = env().HERMES_TIMEOUT_MS;
  const [running, finished] = await Promise.all([
    db
      .from("agent_run_logs")
      .select(SUMMARY_COLUMNS)
      .eq("session_id", sessionId)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(25),
    db
      .from("agent_run_logs")
      .select(SUMMARY_COLUMNS)
      .eq("session_id", sessionId)
      .not("status", "eq", "running")
      .order("created_at", { ascending: false })
      .limit(recentLimit),
  ]);
  if (running.error) fail(running.error.message);
  if (finished.error) fail(finished.error.message);

  const inFlight = ((running.data ?? []) as StoredRun[]).map((r) =>
    summarizeRun(r, nowMs, timeout),
  );
  const recent = [
    ...inFlight.filter((r) => r.status === "stale"),
    ...((finished.data ?? []) as StoredRun[]).map((r) => summarizeRun(r, nowMs, timeout)),
  ]
    .sort((a, b) => (b.finished_at ?? b.started_at).localeCompare(a.finished_at ?? a.started_at))
    .slice(0, recentLimit);

  return {
    now: new Date(nowMs).toISOString(),
    running: inFlight.filter((r) => r.status === "running"),
    recent,
  };
}

export interface RunFilter {
  kind?: string;
  agent?: string;
  limit: number;
}

/** The run log with inputs and outputs, newest first. */
export async function listRuns(
  db: Db,
  sessionId: string,
  filter: RunFilter,
  nowMs = Date.now(),
): Promise<RunDetail[]> {
  let query = db
    .from("agent_run_logs")
    .select(DETAIL_COLUMNS)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(filter.limit);
  if (filter.kind) query = query.eq("kind", filter.kind);
  if (filter.agent) query = query.eq("agent", filter.agent);
  const { data, error } = await query;
  if (error) fail(error.message);
  const timeout = env().HERMES_TIMEOUT_MS;
  type Stored = StoredRun &
    Pick<RunDetail, "hermes_session_id" | "model" | "input_preview" | "output_text">;
  return ((data ?? []) as Stored[]).map((row) => ({
    ...summarizeRun(row, nowMs, timeout),
    hermes_session_id: row.hermes_session_id,
    model: row.model,
    input_preview: row.input_preview,
    output_text: row.output_text,
    created_at: row.created_at,
  }));
}
