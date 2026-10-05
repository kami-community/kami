import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseAgentJson, parseLastJsonBlock } from "./json";

describe("parseLastJsonBlock", () => {
  it("parses the last fenced json block", () => {
    const text = 'plan:\n```json\n{"a":1}\n```\nrevised:\n```json\n{"a":2}\n```';
    expect(parseLastJsonBlock(text)).toEqual({ a: 2 });
  });

  it("accepts an unlabelled fence", () => {
    expect(parseLastJsonBlock("```\n[1, 2]\n```")).toEqual([1, 2]);
  });

  it("falls back to bare JSON surrounded by prose", () => {
    expect(parseLastJsonBlock('Here you go: {"ok": true} — hope that helps.')).toEqual({
      ok: true,
    });
  });

  it("prefers whichever of array or object starts first", () => {
    expect(parseLastJsonBlock('[{"x":1}] trailing')).toEqual([{ x: 1 }]);
  });

  it("returns null when there is no JSON", () => {
    expect(parseLastJsonBlock("no structured output")).toBeNull();
  });

  it("returns null when both fenced and bare JSON are invalid", () => {
    expect(parseLastJsonBlock("```json\n{broken\n```")).toBeNull();
  });
});

describe("parseAgentJson", () => {
  const Schema = z.object({ title: z.string(), score: z.number().min(0).max(1) });

  it("returns validated data", () => {
    expect(parseAgentJson('```json\n{"title":"a","score":0.5}\n```', Schema)).toEqual({
      ok: true,
      data: { title: "a", score: 0.5 },
    });
  });

  it("reports schema issues with their path", () => {
    const result = parseAgentJson('{"title":"a","score":3}', Schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("score");
  });

  it("reports a missing JSON block", () => {
    expect(parseAgentJson("sorry, I can't", Schema)).toEqual({
      ok: false,
      error: "no JSON block found in the answer",
    });
  });
});
