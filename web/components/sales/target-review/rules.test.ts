import { describe, expect, it } from "vitest";
import type { SalesSegment } from "@/lib/domain/segments";
import {
  companies,
  groupAccounts,
  hasB2bSeeds,
  hasEligibleEmail,
  isIncluded,
  isPlgOnly,
  looksLikeEmail,
  mergeScores,
  onlyPlgWarnings,
  primaryAction,
  quadrant,
  type AccountWithMeta,
} from "./rules";

const account = (over: Partial<AccountWithMeta>): AccountWithMeta => ({
  session_id: "s",
  name: "Acme",
  pipeline_stage: "researching",
  ...over,
});

const segment = (over: Partial<SalesSegment>): SalesSegment => ({
  key: "k",
  name: "Seg",
  why_fit: "",
  firmographic: "",
  technographic: "",
  trigger_signal: "",
  motion: "b2b_sales_assisted",
  target_persona: "",
  target_count: 5,
  candidate_companies: [],
  example_user_personas: [],
  ...over,
});

describe("isIncluded", () => {
  it("counts ready and sequencing accounts unless excluded", () => {
    expect(isIncluded(account({ pipeline_stage: "ready_for_approval" }))).toBe(true);
    expect(isIncluded(account({ pipeline_stage: "sequencing" }))).toBe(true);
    expect(isIncluded(account({ pipeline_stage: "researching" }))).toBe(false);
    expect(
      isIncluded(
        account({ pipeline_stage: "ready_for_approval", notes: "x; excluded_from_cohort" }),
      ),
    ).toBe(false);
  });
});

describe("hasEligibleEmail", () => {
  it("accepts evidenced and founder emails, not role inboxes", () => {
    expect(
      hasEligibleEmail(account({ contact: { email: "a@b.co", email_verification: "valid" } })),
    ).toBe(true);
    expect(
      hasEligibleEmail(
        account({ contact: { email: "a@b.co", email_verification: "founder_provided" } }),
      ),
    ).toBe(true);
    expect(
      hasEligibleEmail(
        account({ contact: { email: "hi@b.co", email_verification: "role_inbox" } }),
      ),
    ).toBe(false);
    expect(hasEligibleEmail(account({ contact: null }))).toBe(false);
  });
});

describe("segment shape", () => {
  it("detects PLG-only campaigns and B2B seeds", () => {
    const plg = segment({ motion: "plg_self_serve" });
    const b2b = segment({ candidate_companies: [{ name: "A", domain: "a.com" }] });
    expect(isPlgOnly([plg])).toBe(true);
    expect(isPlgOnly([plg, b2b])).toBe(false);
    expect(isPlgOnly([])).toBe(false);
    expect(hasB2bSeeds([plg])).toBe(false);
    expect(hasB2bSeeds([plg, b2b])).toBe(true);
  });

  it("recognises PLG-only warnings when nothing was found", () => {
    expect(onlyPlgWarnings(0, ["Segment is PLG — individual users"])).toBe(true);
    expect(onlyPlgWarnings(0, ["Domain did not resolve"])).toBe(false);
    expect(onlyPlgWarnings(2, ["PLG"])).toBe(false);
  });
});

describe("mergeScores and groupAccounts", () => {
  it("attaches the score and groups by segment then industry", () => {
    const merged = mergeScores(
      [
        account({ id: "1", segment_key: "s1" }),
        account({ id: "2", industry: "Fintech" }),
        account({ id: "3", segment_key: "s1" }),
      ],
      [
        {
          account_id: "1",
          factors: { fit: 1, intent: 1, contactability: 1, priority: 1 },
          explanation: "x",
        },
      ],
    );
    expect(merged[0].score?.explanation).toBe("x");
    expect(merged[1].score).toBeUndefined();
    expect(groupAccounts(merged).map(([k, list]) => [k, list.length])).toEqual([
      ["s1", 2],
      ["Fintech", 1],
    ]);
  });
});

describe("primaryAction", () => {
  const base = {
    distributionPath: false,
    canCreateDistribution: true,
    hasB2bSeeds: true,
    accountCount: 0,
    includedCount: 0,
    missingEmailSelected: 0,
    missingEmailAny: 0,
  };

  it("picks exactly one next step", () => {
    expect(primaryAction({ ...base, distributionPath: true })).toBe("distribution");
    expect(primaryAction(base)).toBe("discover");
    expect(primaryAction({ ...base, accountCount: 3, missingEmailAny: 2 })).toBe("find_emails");
    expect(primaryAction({ ...base, accountCount: 3, includedCount: 2 })).toBe("draft");
    expect(
      primaryAction({ ...base, accountCount: 3, includedCount: 2, missingEmailSelected: 1 }),
    ).toBe("find_emails");
    expect(primaryAction({ ...base, hasB2bSeeds: false })).toBeNull();
  });
});

describe("small helpers", () => {
  it("formats counts, checks emails and buckets scores", () => {
    expect(companies(1)).toBe("1 company");
    expect(companies(3)).toBe("3 companies");
    expect(looksLikeEmail(" ana@acme.com ")).toBe(true);
    expect(looksLikeEmail("ana@acme")).toBe(false);
    expect(quadrant(0.8, 0.6)).toBe("Act now");
    expect(quadrant(0.8, 0.1)).toBe("Nurture");
    expect(quadrant(0.2, 0.6)).toBe("Qualify");
    expect(quadrant(0.2, 0.1)).toBe("Park");
  });
});
