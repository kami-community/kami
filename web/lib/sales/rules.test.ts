import { describe, expect, it } from "vitest";
import type { EmailDraft } from "@/lib/salesTypes";
import {
  bumpContactability,
  defaultSequenceName,
  EXCLUDED_NOTE,
  FOUND_EMAIL_CONTACTABILITY,
  foundContactRow,
  INCLUDED_NOTE,
  inclusionUpdate,
  latestByAccount,
  partitionSignals,
  primaryChannel,
  primaryContactByAccount,
  sequenceSteps,
  stageTransitionError,
  touchpointRows,
} from "./rules";

describe("stageTransitionError", () => {
  it("allows staying put and listed transitions", () => {
    expect(stageTransitionError("researching", "researching")).toBeNull();
    expect(stageTransitionError("researching", "ready_for_approval")).toBeNull();
    expect(stageTransitionError("ready_for_approval", "sequencing")).toBeNull();
  });

  it("rejects skipping stages and leaving terminal stages", () => {
    expect(stageTransitionError("researching", "sent")).toMatch(/researching → sent/);
    expect(stageTransitionError("closed_won", "engaged")).not.toBeNull();
  });
});

describe("inclusionUpdate", () => {
  it("moves included accounts to ready_for_approval and appends the note", () => {
    expect(inclusionUpdate(null, true)).toEqual({
      pipeline_stage: "ready_for_approval",
      notes: INCLUDED_NOTE,
    });
    expect(inclusionUpdate("seed", false)).toEqual({
      pipeline_stage: "researching",
      notes: `seed; ${EXCLUDED_NOTE}`,
    });
  });
});

describe("latestByAccount", () => {
  it("keeps the first (newest) row per account and skips rows without one", () => {
    const rows = [
      { id: "s3", account_id: "a" },
      { id: "s2", account_id: "b" },
      { id: "s1", account_id: "a" },
      { id: "s0", account_id: null },
    ];
    const latest = latestByAccount(rows);
    expect([...latest.keys()]).toEqual(["a", "b"]);
    expect(latest.get("a")?.id).toBe("s3");
  });
});

describe("bumpContactability", () => {
  it("raises contactability and records where the email came from", () => {
    const result = bumpContactability(
      { factors: { fit: 0.7, intent: 0.4, contactability: 0.1, priority: 0.5 }, explanation: "Fit" },
      { email: "ana@acme.com", method: "site_scrape" },
    );
    expect(result.factors).toEqual({
      fit: 0.7,
      intent: 0.4,
      contactability: FOUND_EMAIL_CONTACTABILITY,
      priority: 0.5,
    });
    expect(result.explanation).toBe("Fit · Found ana@acme.com (site_scrape)");
  });

  it("tolerates missing factors and explanation", () => {
    const result = bumpContactability({ factors: null }, { email: "x@y.co" });
    expect(result.factors.contactability).toBe(FOUND_EMAIL_CONTACTABILITY);
    expect(result.explanation).toBe("· Found x@y.co (lookup)");
  });
});

describe("primaryContactByAccount", () => {
  it("picks the first contact with an email per account", () => {
    const map = primaryContactByAccount([
      { id: "c1", account_id: "a", email: null },
      { id: "c2", account_id: "a", email: "ana@acme.com", email_verification: "valid" },
      { id: "c3", account_id: "a", email: "bo@acme.com" },
      { id: "c4", account_id: "b", email: "hi@b.io", email_verification: "role_inbox" },
    ]);
    expect(map.get("a")).toEqual({
      id: "c2",
      name: undefined,
      email: "ana@acme.com",
      email_verification: "valid",
    });
    expect(map.get("b")?.email_verification).toBe("role_inbox");
  });
});

describe("foundContactRow", () => {
  const base = {
    sessionId: "s",
    accountId: "a",
    campaignId: "c",
    accountName: "Acme",
    at: "2026-01-01T00:00:00.000Z",
  };

  it("never upgrades a role inbox to valid", () => {
    const row = foundContactRow({
      ...base,
      contact: { email: "sales@acme.com", verification_status: "role_inbox" },
    });
    expect(row.email_verification).toBe("role_inbox");
    expect(row.name).toBe("Acme");
  });

  it("stores evidenced finds as valid and unproven ones as unknown", () => {
    expect(
      foundContactRow({
        ...base,
        contact: { email: "ana@acme.com", verification_status: "hermes_evidence" },
      }).email_verification,
    ).toBe("valid");
    expect(
      foundContactRow({
        ...base,
        contact: { email: "ana@acme.com", verification_status: "unverified" },
      }).email_verification,
    ).toBe("unknown");
  });
});

describe("partitionSignals", () => {
  it("dedupes against stored signals and within the batch", () => {
    const signals = [
      { url: "https://a.com/1", detail: "one" },
      { url: "https://a.com/2", detail: "two" },
      { url: "https://a.com/2", detail: "two again" },
      { url: null, detail: "no url" },
      { url: "https://a.com/1", detail: "one again" },
    ];
    const { existingIds, toInsert } = partitionSignals(
      signals,
      new Map([["https://a.com/1", "sig-1"]]),
    );
    expect(existingIds).toEqual(["sig-1"]);
    expect(toInsert.map((s) => s.detail)).toEqual(["two", "no url"]);
  });
});

describe("primaryChannel", () => {
  it("defaults to email", () => {
    expect(primaryChannel(["x", "email"])).toBe("x");
    expect(primaryChannel(null)).toBe("email");
    expect(primaryChannel([])).toBe("email");
  });
});

describe("sequence building", () => {
  it("has three steps with increasing delays", () => {
    const steps = sequenceSteps();
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3]);
    expect(steps[0].delay_days).toBe(0);
    expect(steps[2].delay_days).toBeGreaterThan(steps[1].delay_days);
  });

  it("names the sequence by date", () => {
    expect(defaultSequenceName(new Date("2026-03-04T10:00:00Z"))).toBe(
      "Email sequence — 2026-03-04",
    );
  });

  it("turns drafts into drafted email touchpoints", () => {
    const drafts: EmailDraft[] = [
      {
        subject: "Hi",
        body: "Body",
        cta: "Reply?",
        evidence_refs: ["sig-1"],
        sequence_step: 1,
        signal_ref: "sig-1",
      },
      { subject: "Again", body: "B2", cta: "C2", evidence_refs: [], sequence_step: 2 },
    ];
    const rows = touchpointRows("s", "e", drafts);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      session_id: "s",
      enrollment_id: "e",
      channel: "email",
      step: 1,
      status: "drafted",
      draft_metadata: { evidence_refs: ["sig-1"], signal_ref: "sig-1" },
    });
    expect(rows[1].draft_metadata.signal_ref).toBeNull();
  });
});
