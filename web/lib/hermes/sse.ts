/**
 * Parse OpenAI-style SSE chunks from the Hermes API server into assistant text.
 * Feed raw decoded text in; complete `data:` lines are consumed and the
 * unfinished tail is kept for the next chunk. Safe in the browser and on the server.
 */
export function createSseTextParser() {
  let buffer = "";

  function take(line: string): string {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return "";
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return "";
    try {
      const json = JSON.parse(payload) as {
        choices?: { delta?: { content?: string }; message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content;
      return typeof text === "string" ? text : "";
    } catch {
      return "";
    }
  }

  return {
    /** Returns the assistant text contained in the complete lines of this chunk. */
    push(chunk: string): string {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return lines.map(take).join("");
    },
    /** Flush the remaining tail at end of stream. */
    end(): string {
      const tail = take(buffer);
      buffer = "";
      return tail;
    },
  };
}
