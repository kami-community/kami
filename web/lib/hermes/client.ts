import { randomBytes } from "node:crypto";
import type { ZodType, z } from "zod";
import { trackAgentRun } from "@/lib/agentRunLog";
import { env } from "@/lib/config/env";
import { AppError, notConfigured, upstreamFailed } from "@/lib/http/errors";
import { traceGatewayCall } from "@/lib/tracing";
import { agentSystemPrompt, type AgentName } from "./agents";
import { parseAgentJson } from "./json";
import { createSseTextParser } from "./sse";

/**
 * The only way Kami talks to Hermes. Every call:
 * - runs a named agent (role prompt from agents/*.md as the system message),
 * - uses a Hermes session id `kami-<campaign>-<agent>-<run>` so runs stay
 *   isolated yet traceable per campaign in Hermes' own state,
 * - is logged to agent_run_logs as `running` when it starts and updated when
 *   it ends (the Team indicator shows live runs), and traced (Langfuse),
 * - throws a typed AppError on failure instead of returning null.
 */

export interface HermesCall {
  agent: AgentName;
  /** Stable run label shown in Activity, e.g. "sales_plan". */
  kind: string;
  input: string;
  /** Campaign session (agent_sessions.id). */
  kamiSessionId?: string | null;
  /**
   * "run" (default): a fresh Hermes session per call — no history leaks between runs.
   * "campaign": one Hermes session per campaign+agent, for conversational agents.
   */
  continuity?: "run" | "campaign";
  timeoutMs?: number;
  meta?: Record<string, unknown>;
}

export interface HermesCompletion {
  text: string;
  hermesSessionId: string;
  durationMs: number;
}

export function hermesConfigured(): boolean {
  return Boolean(env().HERMES_API_KEY);
}

export function hermesSessionIdFor(
  call: Pick<HermesCall, "agent" | "kamiSessionId" | "continuity">,
): string {
  const base = `kami-${call.kamiSessionId ?? "local"}-${call.agent}`;
  return call.continuity === "campaign" ? base : `${base}-${randomBytes(4).toString("hex")}`;
}

function request(call: HermesCall, hermesSessionId: string, stream: boolean, signal: AbortSignal) {
  const config = env();
  if (!config.HERMES_API_KEY)
    throw notConfigured("HERMES_API_KEY is not set — start Hermes and configure the web app");
  return fetch(config.HERMES_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.HERMES_API_KEY}`,
      "Content-Type": "application/json",
      "X-Hermes-Session-Id": hermesSessionId,
    },
    body: JSON.stringify({
      model: config.HERMES_MODEL,
      stream,
      messages: [
        { role: "system", content: agentSystemPrompt(call.agent) },
        { role: "user", content: call.input },
      ],
    }),
    signal,
  });
}

function logBase(
  call: HermesCall,
  hermesSessionId: string,
  source: "hermes_once" | "hermes_stream",
  timeoutMs: number,
) {
  return {
    sessionId: call.kamiSessionId,
    hermesSessionId,
    source,
    kind: call.kind,
    agent: call.agent,
    model: env().HERMES_MODEL,
    input: call.input,
    meta: { ...(call.meta ?? {}), timeout_ms: timeoutMs },
  } as const;
}

/** One-shot completion. */
export async function complete(call: HermesCall): Promise<HermesCompletion> {
  const hermesSessionId = hermesSessionIdFor(call);
  const started = Date.now();
  const timeoutMs = call.timeoutMs ?? env().HERMES_TIMEOUT_MS;
  const log = logBase(call, hermesSessionId, "hermes_once", timeoutMs);
  const run = trackAgentRun(log);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const trace = traceGatewayCall({
    name: call.kind,
    sessionId: hermesSessionId,
    model: log.model,
    input: call.input,
  });

  try {
    const res = trace.wrap(await request(call, hermesSessionId, false, controller.signal));
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw upstreamFailed(`Hermes returned HTTP ${res.status}`, {
        hermes_body: body.slice(0, 300),
      });
    }
    const json = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    const text = json?.choices?.[0]?.message?.content?.trim();
    if (!text) throw upstreamFailed(`the ${call.agent} agent returned an empty answer`);

    const durationMs = Date.now() - started;
    run.finish({ status: "ok", outputText: text, durationMs });
    return { text, hermesSessionId, durationMs };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const error = aborted
      ? upstreamFailed(`the ${call.agent} agent timed out`)
      : err instanceof AppError
        ? err
        : upstreamFailed(
            `could not reach Hermes: ${err instanceof Error ? err.message : "unknown error"}`,
          );
    trace.fail(error.message);
    run.finish({
      status: aborted ? "timeout" : "error",
      error: error.message,
      durationMs: Date.now() - started,
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run an agent that must answer with a JSON block matching `schema`. If the
 * first answer does not validate, the agent gets one chance to correct it.
 */
export async function runAgentJson<S extends ZodType>(
  call: HermesCall & { schema: S },
): Promise<{ data: z.output<S>; completion: HermesCompletion }> {
  const first = await complete(call);
  const parsed = parseAgentJson(first.text, call.schema);
  if (parsed.ok) return { data: parsed.data, completion: first };

  const retry = await complete({
    ...call,
    kind: `${call.kind}_retry`,
    input: `${call.input}\n\nYour previous answer could not be used: ${parsed.error}\nReply again with only the corrected fenced \`\`\`json block.`,
  });
  const second = parseAgentJson(retry.text, call.schema);
  if (second.ok) return { data: second.data, completion: retry };
  throw upstreamFailed(
    `the ${call.agent} agent returned output Kami could not use: ${second.error}`,
  );
}

/**
 * Streaming completion as an SSE `Response` for a route handler. The stream is
 * passed through to the browser untouched; the full text is logged when it ends.
 */
export async function streamResponse(call: HermesCall): Promise<Response> {
  const hermesSessionId = hermesSessionIdFor(call);
  const started = Date.now();
  const timeoutMs = call.timeoutMs ?? env().HERMES_TIMEOUT_MS * 3;
  const log = logBase(call, hermesSessionId, "hermes_stream", timeoutMs);
  const run = trackAgentRun(log);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const trace = traceGatewayCall({
    name: call.kind,
    sessionId: hermesSessionId,
    model: log.model,
    input: call.input,
  });

  let upstream: Response;
  try {
    upstream = await request(call, hermesSessionId, true, controller.signal);
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof AppError ? err.message : "could not reach Hermes";
    trace.fail(message);
    run.finish({ status: "error", error: message, durationMs: Date.now() - started });
    if (err instanceof AppError) throw err;
    throw upstreamFailed(message);
  }
  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    const body = await upstream.text().catch(() => "");
    trace.fail(`HTTP ${upstream.status}`);
    run.finish({
      status: "error",
      error: `HTTP ${upstream.status}: ${body.slice(0, 300)}`,
      durationMs: Date.now() - started,
    });
    throw upstreamFailed(`Hermes returned HTTP ${upstream.status}`);
  }

  const traced = trace.wrap(upstream);
  const [toClient, toLog] = traced.body!.tee();

  void (async () => {
    const parser = createSseTextParser();
    const decoder = new TextDecoder();
    let full = "";
    try {
      const reader = toLog.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += parser.push(decoder.decode(value, { stream: true }));
      }
      full += parser.end();
      run.finish({
        status: full.trim() ? "ok" : "error",
        outputText: full.trim() || null,
        error: full.trim() ? null : "empty stream",
        durationMs: Date.now() - started,
      });
    } catch (err) {
      run.finish({
        status: "error",
        error: err instanceof Error ? err.message : "stream failed",
        durationMs: Date.now() - started,
      });
    } finally {
      clearTimeout(timer);
    }
  })();

  return new Response(toClient, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Hermes-Session-Id": hermesSessionId,
    },
  });
}

/**
 * For steps with a deterministic fallback: the completion text, or null when
 * Hermes is not configured or the call failed (the failure is already logged).
 */
export async function completeOrNull(call: HermesCall): Promise<string | null> {
  if (!hermesConfigured()) return null;
  try {
    return (await complete(call)).text;
  } catch {
    return null;
  }
}
