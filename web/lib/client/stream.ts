import { createGuideEventParser, type GuideEvent } from "@/lib/domain/guideEvents";
import { ApiError } from "./api";

/**
 * POST JSON to an event-stream route (Kami Guide) and deliver each typed
 * event as it arrives. Resolves when the stream ends; rejects with an
 * `ApiError` when the request itself fails. Abort with `signal` to stop.
 */
export async function postEvents(
  url: string,
  body: unknown,
  onEvent: (event: GuideEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    throw new ApiError(0, { error: "Network error — is the Kami server running?" });
  }
  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(res.status, json);
  }

  const parser = createGuideEventParser();
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const e of parser.push(decoder.decode(value, { stream: true }))) onEvent(e);
    }
    for (const e of parser.end()) onEvent(e);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    throw err;
  }
}
