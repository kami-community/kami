import { dbOrNull } from "@/lib/db/client";

const PREVIEW_CHARS = 4_000;
const OUTPUT_CHARS = 200_000;

export type AgentRunSource = "hermes_once" | "hermes_stream" | "pipeline";
/** Stored statuses. `running` rows are updated in place when the run ends. */
export type AgentRunStatus = "running" | "ok" | "error" | "timeout" | "fallback" | "skipped";

export interface AgentRunLogInput {
  sessionId?: string | null;
  hermesSessionId?: string | null;
  source: AgentRunSource;
  kind: string;
  agent?: string | null;
  status?: AgentRunStatus;
  model?: string | null;
  input?: string | null;
  outputText?: string | null;
  outputJson?: unknown;
  error?: string | null;
  durationMs?: number | null;
  meta?: Record<string, unknown>;
}

/** How a tracked run ended. */
export interface AgentRunResult {
  status: Exclude<AgentRunStatus, "running">;
  outputText?: string | null;
  outputJson?: unknown;
  error?: string | null;
  durationMs: number;
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n…[truncated ${value.length - max} chars]`;
}

function warn(err: unknown) {
  console.warn("[agent_run_logs]", err instanceof Error ? err.message : err);
}

function row(input: AgentRunLogInput) {
  return {
    session_id: input.sessionId || null,
    hermes_session_id: input.hermesSessionId || null,
    source: input.source,
    kind: input.kind,
    agent: input.agent ?? null,
    status: input.status ?? "ok",
    model: input.model ?? null,
    input_preview: truncate(input.input, PREVIEW_CHARS),
    output_text: truncate(input.outputText, OUTPUT_CHARS),
    output_json: input.outputJson ?? null,
    error: input.error ? truncate(input.error, PREVIEW_CHARS) : null,
    duration_ms: input.durationMs ?? null,
    meta: {
      ...(input.meta ?? {}),
      input_truncated: Boolean(input.input && input.input.length > PREVIEW_CHARS),
      output_truncated: Boolean(input.outputText && input.outputText.length > OUTPUT_CHARS),
    },
  };
}

/**
 * Persist one observable run. Never throws — observability must not break product flows.
 */
export async function logAgentRun(input: AgentRunLogInput): Promise<string | null> {
  const sb = dbOrNull();
  if (!sb) return null;

  try {
    const { data, error } = await sb
      .from("agent_run_logs")
      .insert(row(input))
      .select("id")
      .maybeSingle();
    if (error) {
      warn(error);
      return null;
    }
    return (data?.id as string | undefined) ?? null;
  } catch (err) {
    warn(err);
    return null;
  }
}

/** Fire-and-forget wrapper for hot paths. */
export function logAgentRunAsync(input: AgentRunLogInput): void {
  void logAgentRun(input);
}

/**
 * Record that a run has started: a `running` row the Team indicator can show
 * while the agent works. Returns the row id, or null when it could not be
 * written (the run is then logged once, when it ends). Never throws.
 */
export async function startAgentRun(input: AgentRunLogInput): Promise<string | null> {
  return logAgentRun({
    ...input,
    status: "running",
    outputText: null,
    outputJson: null,
    error: null,
    durationMs: null,
    meta: { ...(input.meta ?? {}), live: true },
  });
}

/**
 * Record how a run ended: update its `running` row, or — when there is none or
 * the update did not land — insert the finished run instead. Never throws.
 */
export async function finishAgentRun(
  runId: string | null,
  input: AgentRunLogInput,
  result: AgentRunResult,
): Promise<void> {
  const finished = row({ ...input, ...result, meta: { ...(input.meta ?? {}), live: true } });
  const sb = dbOrNull();
  if (runId && sb) {
    try {
      const { data, error } = await sb
        .from("agent_run_logs")
        .update({
          status: finished.status,
          output_text: finished.output_text,
          output_json: finished.output_json,
          error: finished.error,
          duration_ms: finished.duration_ms,
          meta: finished.meta,
        })
        .eq("id", runId)
        .select("id");
      if (!error && Array.isArray(data) && data.length > 0) return;
      if (error) warn(error);
    } catch (err) {
      warn(err);
    }
  }
  await logAgentRun({ ...input, ...result });
}

/**
 * Track one run from start to finish without slowing the caller: the start row
 * is written in the background, and `finish` updates it once that write lands.
 */
export function trackAgentRun(input: AgentRunLogInput): {
  finish: (result: AgentRunResult) => void;
  /** resolves when the start row is written (tests) */
  started: Promise<string | null>;
} {
  const started = startAgentRun(input);
  let done: Promise<void> | null = null;
  return {
    started,
    finish(result) {
      if (done) return;
      done = started.then((id) => finishAgentRun(id, input, result)).catch(warn);
    },
  };
}
