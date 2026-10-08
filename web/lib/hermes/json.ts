import type { ZodType, z } from "zod";

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

export type AgentJsonResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Extract the agent's JSON answer and validate it against `schema`. */
export function parseAgentJson<S extends ZodType>(
  text: string,
  schema: S,
): AgentJsonResult<z.output<S>> {
  const raw = parseLastJsonBlock(text);
  if (raw === null) return { ok: false, error: "no JSON block found in the answer" };
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
  return { ok: false, error: issues.join("; ") };
}
