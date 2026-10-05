import { createSseTextParser } from "@/lib/hermes/sse";

/**
 * POST JSON to a streaming API route and deliver assistant text as it arrives.
 * Resolves with the full text; rejects with the server's error message.
 */
export async function postStream(
  url: string,
  body: unknown,
  onText: (delta: string) => void,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  }

  const parser = createSseTextParser();
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = parser.push(decoder.decode(value, { stream: true }));
    if (text) {
      full += text;
      onText(text);
    }
  }
  const tail = parser.end();
  if (tail) {
    full += tail;
    onText(tail);
  }
  return full;
}
