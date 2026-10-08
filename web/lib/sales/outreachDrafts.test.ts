import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvForTests } from "@/lib/config/env";
import { greetingName } from "@/lib/salesSequences";
import { draftSequence } from "./outreachDrafts";

describe("greetingName", () => {
  it("uses the contact's first name", () => {
    expect(greetingName("Jane Doe")).toBe("Jane");
  });
  it("falls back to a neutral greeting rather than the company name", () => {
    expect(greetingName(null)).toBe("there");
    expect(greetingName("")).toBe("there");
    expect(greetingName("j.")).toBe("there");
  });
});

describe("draftSequence without Hermes", () => {
  const saved = process.env.HERMES_API_KEY;
  beforeEach(() => {
    delete process.env.HERMES_API_KEY;
    resetEnvForTests();
  });
  afterEach(() => {
    if (saved) process.env.HERMES_API_KEY = saved;
    resetEnvForTests();
  });

  it("returns a labelled 3-step template that never greets the company", async () => {
    const result = await draftSequence({
      sessionId: "00000000-0000-0000-0000-000000000000",
      contextPack: "",
      offer: "faster agent debugging",
      approvedClaims: [],
      goal: "book meetings",
      account: { name: "Stripe", domain: "stripe.com" },
      contact: { name: null },
      signals: [],
    });
    expect(result.source).toBe("template");
    expect(result.drafts.map((d) => d.sequence_step)).toEqual([1, 2, 3]);
    for (const d of result.drafts) {
      expect(d.body.startsWith("Hi there,")).toBe(true);
      expect(d.body).toContain("unsubscribe");
    }
  });
});
