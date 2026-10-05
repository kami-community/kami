import { dbOrNull } from "@/lib/db/client";

const PREVIEW_CHARS = 4_000;
const OUTPUT_CHARS = 200_000;

export type AgentRunSource = "hermes_once" | "hermes_stream" | "pipeline";
export type AgentRunStatus = "ok" | "error" | "timeout" | "fallback" | "skipped";

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

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n…[truncated ${value.length - max} chars]`;
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
      .insert({
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
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("[agent_run_logs]", error.message);
      return null;
    }
    return (data?.id as string | undefined) ?? null;
  } catch (err) {
    console.warn("[agent_run_logs]", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Fire-and-forget wrapper for hot paths. */
export function logAgentRunAsync(input: AgentRunLogInput): void {
  void logAgentRun(input);
}
