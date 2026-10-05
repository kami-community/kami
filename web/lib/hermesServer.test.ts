import { describe, expect, it } from "vitest";
import { parseLastJsonBlock } from "@/lib/hermesServer";

describe("parseLastJsonBlock", () => {
  it("parses the last fenced json block", () => {
    const text = 'plan:\n```json\n{"a":1}\n```\nrevised:\n```json\n{"a":2}\n```';
    expect(parseLastJsonBlock(text)).toEqual({ a: 2 });
  });

  it("accepts an unlabelled fence", () => {
    expect(parseLastJsonBlock('```\n[1, 2]\n```')).toEqual([1, 2]);
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
    expect(parseLastJsonBlock('```json\n{broken\n```')).toBeNull();
  });
});
