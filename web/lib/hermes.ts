export interface IcpBucket {
  label: string;
  where_they_live: string;
  trigger_signal: string;
  est_size: string;
  angle: string;
}

export interface Opportunity {
  title: string;
  playbook: string;
  detail: string;
}

export interface Dossier {
  company: string;
  brand_voice: string;
  positioning: string;
  tone?: string[];
  competitor_analysis: { name: string; insight: string }[];
  icp_buckets: IcpBucket[];
  opportunities: Opportunity[];
  /** Domain-truth fields */
  canonical_domain?: string;
  identity_confidence?: number;
  evidence_urls?: string[];
  product_category?: string;
  industries?: string[];
  personas?: string[];
  geos?: string[];
}

export function newSessionId(): string {
  return `kami-ui-${Date.now()}`;
}

export interface StreamChatOptions {
  /** Supabase agent_sessions.id for agent_run_logs */
  kamiSessionId?: string | null;
  kind?: string;
  agent?: string;
  /** Soft completion budget — used for Ask Kami brevity */
  maxTokens?: number;
}

/**
 * POST a message to the Hermes gateway via /api/chat and stream the
 * assistant text back through onDelta. Returns the full text.
 * Server logs the completed stream into Supabase `agent_run_logs`.
 */
export async function streamChat(
  content: string,
  sessionId: string,
  onDelta: (text: string) => void,
  options?: StreamChatOptions,
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hermes-Session-Id": sessionId,
      ...(options?.kamiSessionId ? { "X-Kami-Session-Id": options.kamiSessionId } : {}),
      ...(options?.kind ? { "X-Kami-Run-Kind": options.kind } : {}),
      ...(options?.agent ? { "X-Kami-Agent": options.agent } : {}),
    },
    body: JSON.stringify({
      model: "gpt-5.4",
      stream: true,
      messages: [{ role: "user", content }],
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gateway error ${res.status}: ${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta: string =
          json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // partial JSON across chunks
      }
    }
  }

  if (!full && buffer.trim().startsWith("{")) {
    try {
      const json = JSON.parse(buffer);
      full = json.choices?.[0]?.message?.content ?? "";
      if (full) onDelta(full);
    } catch {
      /* leave empty */
    }
  }

  return full;
}

/** Extract the last fenced ```json block from agent output (raw, unvalidated). */
export function parseDossierRaw(text: string): unknown | null {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  const last = matches.at(-1)?.[1];
  if (!last) return null;
  try {
    return JSON.parse(last);
  } catch {
    return null;
  }
}
