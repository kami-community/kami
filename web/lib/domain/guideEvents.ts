/**
 * Kami Guide's server-sent events. The guide route turns Hermes' token stream
 * into these typed events so the browser can render sources, streamed text,
 * follow-up suggestions and a final timing without parsing provider formats.
 *
 *   event: context    { sources, focus }       once, before any text
 *   event: delta      { text }                 zero or more
 *   event: followups  { items }               at most once, after the text
 *   event: done       { durationMs }           exactly once on success
 *   event: error      { error }                instead of done on failure
 */

export interface GuideSource {
  name: string;
  domain: string;
  href: string;
}

export type GuideEvent =
  | { event: "context"; data: { sources: GuideSource[]; focus: string | null } }
  | { event: "delta"; data: { text: string } }
  | { event: "followups"; data: { items: string[] } }
  | { event: "done"; data: { durationMs: number } }
  | { event: "error"; data: { error: string } };

/** The marker the guide agent ends its answer with (stripped from the text). */
export const FOLLOW_UPS_MARKER = "FOLLOW_UPS:";

/** Encode one event in SSE wire format. */
export function encodeGuideEvent(e: GuideEvent): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

/**
 * Incremental SSE decoder for named events. Feed decoded text in; complete
 * events come out. Unknown event names are ignored.
 */
export function createGuideEventParser() {
  let buffer = "";
  const KNOWN = new Set(["context", "delta", "followups", "done", "error"]);

  function parseBlock(block: string): GuideEvent | null {
    let name = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!KNOWN.has(name) || !data.length) return null;
    try {
      return { event: name, data: JSON.parse(data.join("\n")) } as GuideEvent;
    } catch {
      return null;
    }
  }

  return {
    push(chunk: string): GuideEvent[] {
      buffer += chunk.replace(/\r\n/g, "\n");
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      return blocks.map(parseBlock).filter((e): e is GuideEvent => e !== null);
    },
    end(): GuideEvent[] {
      const tail = buffer.trim() ? parseBlock(buffer) : null;
      buffer = "";
      return tail ? [tail] : [];
    },
  };
}
