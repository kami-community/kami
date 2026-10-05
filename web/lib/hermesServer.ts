/**
 * Non-streaming Hermes gateway helper for server-side route handlers.
 * Times out and returns null so callers can fall back deterministically.
 * Every call is logged to Supabase `agent_run_logs` when DB is configured.
 */

import { logAgentRunAsync } from "@/lib/agentRunLog";

const GATEWAY = process.env.HERMES_GATEWAY_URL ?? "http://127.0.0.1:8642/v1/chat/completions";
const KEY = process.env.HERMES_API_KEY;

const DEFAULT_TIMEOUT_MS = 90_000;

export function hermesGatewayConfigured(): boolean {
  return Boolean(KEY);
}

export interface HermesChatParams {
  content: string;
  sessionId?: string;
  /** Supabase agent_sessions.id — required for end-to-end observability. */
  kamiSessionId?: string | null;
  /** Stable run label, e.g. sales_plan, dossier_revise. */
  kind?: string;
  agent?: string;
  model?: string;
  timeoutMs?: number;
  meta?: Record<string, unknown>;
}

/**
 * One-shot completion. Returns assistant text or null on timeout / misconfig / error.
 */
export async function hermesChatOnce(params: HermesChatParams): Promise<string | null> {
  const kind = params.kind ?? "hermes_once";
  const model = params.model ?? "gpt-5.4";
  const started = Date.now();

  if (!KEY) {
    logAgentRunAsync({
      sessionId: params.kamiSessionId,
      hermesSessionId: params.sessionId,
      source: "hermes_once",
      kind,
      agent: params.agent,
      status: "skipped",
      model,
      input: params.content,
      error: "HERMES_API_KEY not configured",
      durationMs: Date.now() - started,
      meta: params.meta,
    });
    return null;
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        ...(params.sessionId ? { "X-Hermes-Session-Id": params.sessionId } : {}),
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: "user", content: params.content }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      logAgentRunAsync({
        sessionId: params.kamiSessionId,
        hermesSessionId: params.sessionId,
        source: "hermes_once",
        kind,
        agent: params.agent,
        status: "error",
        model,
        input: params.content,
        error: `HTTP ${res.status}: ${errBody.slice(0, 500)}`,
        durationMs: Date.now() - started,
        meta: params.meta,
      });
      return null;
    }
    const json = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    const text = json?.choices?.[0]?.message?.content;
    const ok = typeof text === "string" && text.trim();
    logAgentRunAsync({
      sessionId: params.kamiSessionId,
      hermesSessionId: params.sessionId,
      source: "hermes_once",
      kind,
      agent: params.agent,
      status: ok ? "ok" : "error",
      model,
      input: params.content,
      outputText: ok ? text : null,
      error: ok ? null : "empty assistant content",
      durationMs: Date.now() - started,
      meta: params.meta,
    });
    return ok ? text : null;
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    logAgentRunAsync({
      sessionId: params.kamiSessionId,
      hermesSessionId: params.sessionId,
      source: "hermes_once",
      kind,
      agent: params.agent,
      status: aborted ? "timeout" : "error",
      model,
      input: params.content,
      error: err instanceof Error ? err.message : "gateway error",
      durationMs: Date.now() - started,
      meta: params.meta,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Extract the last fenced ```json block from agent output. */
/**
 * Parse the last fenced ```json block, or fall back to a bare JSON array/object
 * in the response (Hermes often returns bare JSON despite prompt requests).
 */
export function parseLastJsonBlock(text: string): unknown | null {
  const matches = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  const last = matches.at(-1)?.[1];
  if (last) {
    try {
      return JSON.parse(last.trim());
    } catch {
      /* fall through to bare JSON */
    }
  }

  const trimmed = text.trim();
  const arrayStart = trimmed.indexOf("[");
  const objectStart = trimmed.indexOf("{");
  let start = -1;
  if (arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart)) start = arrayStart;
  else if (objectStart >= 0) start = objectStart;
  if (start < 0) return null;

  const candidate = trimmed.slice(start);
  // Try full slice, then progressive trim from the end for trailing prose.
  for (let end = candidate.length; end > 1; end--) {
    const slice = candidate.slice(0, end).trim();
    if (!(slice.endsWith("]") || slice.endsWith("}"))) continue;
    try {
      return JSON.parse(slice);
    } catch {
      /* keep shrinking */
    }
  }
  return null;
}
