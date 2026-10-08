import { describe, expect, it } from "vitest";
import type { CampaignProgress } from "@/lib/campaigns/progress";
import { salesGates, salesSteps, stepperCollapsed, tabGate, type SalesGates } from "./salesSteps";

const base: SalesGates = {
  configured: false,
  segmentsConfirmed: false,
  planApproved: false,
  drafted: false,
  sent: false,
};

const states = (g: SalesGates) => salesSteps(g).map((s) => s.state);

describe("salesSteps", () => {
  it("starts on Who you sell to with everything else locked", () => {
    expect(states(base)).toEqual(["current", "locked", "locked", "locked"]);
    expect(salesSteps(base)[1].hint).toMatch(/who you sell to/i);
  });

  it("moves to Plan once segments are confirmed", () => {
    expect(states({ ...base, configured: true, segmentsConfirmed: true })).toEqual([
      "done",
      "current",
      "locked",
      "locked",
    ]);
  });

  it("opens Companies after the plan is approved", () => {
    const g = { ...base, configured: true, segmentsConfirmed: true, planApproved: true };
    expect(states(g)).toEqual(["done", "done", "current", "locked"]);
    expect(salesSteps(g)[3].hint).toMatch(/contact email/i);
  });

  it("opens Emails once drafts exist, and is all done after a send", () => {
    const g = {
      ...base,
      configured: true,
      segmentsConfirmed: true,
      planApproved: true,
      drafted: true,
    };
    expect(states(g)).toEqual(["done", "done", "done", "current"]);
    expect(stepperCollapsed(g)).toBe(false);
    const sent = { ...g, sent: true };
    expect(states(sent)).toEqual(["done", "done", "done", "done"]);
    expect(stepperCollapsed(sent)).toBe(true);
  });

  it("a new draft plan re-locks Companies and Emails until it is approved", () => {
    const g = {
      ...base,
      configured: true,
      segmentsConfirmed: true,
      planApproved: false,
      drafted: true,
    };
    expect(states(g)).toEqual(["done", "current", "locked", "locked"]);
    expect(salesSteps(g)[3].hint).toMatch(/approve the plan/i);
  });
});

describe("tabGate", () => {
  it("locks Companies and Emails until the plan is approved", () => {
    expect(tabGate("companies", base)?.goTo).toBe("plan");
    expect(tabGate("companies", base)?.cta).toMatch(/who you sell to/i);
    expect(tabGate("emails", base)?.goTo).toBe("plan");
    expect(tabGate("plan", base)).toBeNull();
  });

  it("asks to approve the plan once who is confirmed", () => {
    const g = { ...base, configured: true, segmentsConfirmed: true };
    expect(tabGate("companies", g)?.hint).toMatch(/approve the plan/i);
    expect(tabGate("pipeline", g)?.cta).toBe("Go to Plan");
  });

  it("sends Emails back to Companies when nothing is drafted", () => {
    const g = { ...base, configured: true, segmentsConfirmed: true, planApproved: true };
    expect(tabGate("companies", g)).toBeNull();
    expect(tabGate("emails", g)?.goTo).toBe("companies");
    expect(tabGate("emails", { ...g, drafted: true })).toBeNull();
  });
});

describe("salesGates", () => {
  it("reads server progress", () => {
    const progress = {
      sales: {
        configured: true,
        segmentsConfirmed: true,
        planStatus: "approved",
        drafts: { pending: 0, approved: 0, sent: 2 },
      },
    } as unknown as CampaignProgress;
    expect(salesGates(progress, false)).toEqual({
      configured: true,
      segmentsConfirmed: true,
      planApproved: true,
      drafted: true,
      sent: true,
    });
    expect(salesGates(null, true).configured).toBe(true);
  });
});
