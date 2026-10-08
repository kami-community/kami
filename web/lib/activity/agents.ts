import { env } from "@/lib/config/env";
import type { Db } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { AGENTS } from "@/lib/hermes/agents";
import { AGENT_LABELS, agentLabel, isFailedStatus, kindLabel } from "./labels";
import { summarizeRun, type RunSummary, type StoredRun } from "./runs";

/**
 * The Team roster: every registered Hermes agent with its role and skills,
 * joined with how it has worked on this campaign.
 */

export interface AgentCard {
  name: string;
  label: string;
  role: string;
  skills: string[];
  /** false for steps logged under a non-Hermes name (e.g. the discovery pipeline) */
  registered: boolean;
  runs: number;
  ok: number;
  failed: number;
  /** ok / (ok + failed), 0–1; null before any finished run */
  success_rate: number | null;
  last_run_at: string | null;
  last_kind: string | null;
  last_task: string | null;
  /** runs in flight right now */
  running: number;
  /** start of the oldest run in flight, for a live timer */
  running_since: string | null;
}

export interface AgentRoster {
  now: string;
  agents: AgentCard[];
}

/** Enough history for meaningful stats without scanning the whole table. */
const HISTORY_LIMIT = 2_000;

function emptyCard(name: string, skills: readonly string[], registered: boolean): AgentCard {
  return {
    name,
    label: agentLabel(name),
    role: AGENT_LABELS[name]?.role ?? "Runs a step of your campaign.",
    skills: [...skills],
    registered,
    runs: 0,
    ok: 0,
    failed: 0,
    success_rate: null,
    last_run_at: null,
    last_kind: null,
    last_task: null,
    running: 0,
    running_since: null,
  };
}

/** Fold run summaries (newest first) into per-agent cards. Pure, for tests. */
export function buildRoster(
  registry: Record<string, { skills: readonly string[] }>,
  runs: RunSummary[],
): AgentCard[] {
  const cards = new Map<string, AgentCard>();
  for (const [name, spec] of Object.entries(registry))
    cards.set(name, emptyCard(name, spec.skills, true));

  for (const run of runs) {
    if (!run.agent) continue;
    let card = cards.get(run.agent);
    if (!card) {
      card = emptyCard(run.agent, [], false);
      cards.set(run.agent, card);
    }
    card.runs += 1;
    if (run.status === "running") {
      card.running += 1;
      if (!card.running_since || run.started_at < card.running_since)
        card.running_since = run.started_at;
    } else if (run.status === "ok") card.ok += 1;
    else if (isFailedStatus(run.status)) card.failed += 1;
    if (!card.last_run_at) {
      card.last_run_at = run.started_at;
      card.last_kind = run.kind;
      card.last_task = kindLabel(run.kind);
    }
  }

  for (const card of cards.values()) {
    const finished = card.ok + card.failed;
    card.success_rate = finished ? card.ok / finished : null;
  }
  return [...cards.values()];
}

export async function agentRoster(
  db: Db,
  sessionId: string,
  nowMs = Date.now(),
): Promise<AgentRoster> {
  const { data, error } = await db
    .from("agent_run_logs")
    .select("id, agent, kind, source, status, duration_ms, error, created_at, meta")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new AppError("internal", `could not read agent runs: ${error.message}`);
  const timeout = env().HERMES_TIMEOUT_MS;
  const runs = ((data ?? []) as StoredRun[]).map((r) => summarizeRun(r, nowMs, timeout));
  return { now: new Date(nowMs).toISOString(), agents: buildRoster(AGENTS, runs) };
}
