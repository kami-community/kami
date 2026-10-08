import { describe, expect, it } from "vitest";
import { fakeDb } from "@/lib/testing/fakeDb";
import { getCampaignProgress, nextSalesStep } from "./progress";

const SESSION = "6f1c1d0e-2a51-4f6b-9a8e-0d1f0c9b7a11";
const OTHER = "0b8e1f2c-3d4a-4b5c-8d6e-7f8091a2b3c4";

function base(extra: Record<string, Record<string, unknown>[]> = {}) {
  return fakeDb({
    agent_sessions: [{ id: SESSION, paused: false, dossier_confirmed_at: "2026-10-01T00:00:00Z" }],
    sales_campaigns: [],
    sales_plans: [],
    sales_accounts: [],
    sales_touchpoints: [],
    sales_notifications: [],
    sales_meetings: [],
    sales_tasks: [],
    distribution_campaigns: [],
    distribution_opportunities: [],
    outbound_receipts: [],
    ...extra,
  }).db;
}

describe("nextSalesStep", () => {
  it("walks the gates in order", () => {
    const off = {
      segmentsConfirmed: false,
      planApproved: false,
      sequencesCreated: false,
      hasSent: false,
    };
    expect(nextSalesStep(off)).toBe("segments");
    expect(nextSalesStep({ ...off, segmentsConfirmed: true })).toBe("plan");
    expect(nextSalesStep({ ...off, segmentsConfirmed: true, planApproved: true })).toBe("find");
    expect(
      nextSalesStep({
        ...off,
        segmentsConfirmed: true,
        planApproved: true,
        sequencesCreated: true,
      }),
    ).toBe("emails");
    expect(
      nextSalesStep({
        segmentsConfirmed: true,
        planApproved: true,
        sequencesCreated: true,
        hasSent: true,
      }),
    ).toBe("needs");
  });
});

describe("getCampaignProgress", () => {
  it("reports an untouched campaign at the first gate", async () => {
    const p = await getCampaignProgress(base(), SESSION);
    expect(p.dossierConfirmed).toBe(true);
    expect(p.sales.configured).toBe(false);
    expect(p.sales.nextStep).toBe("segments");
    expect(p.sales.planStatus).toBe("none");
    expect(p.marketing.planStatus).toBe("none");
    expect(p.outbound.sent).toBe(0);
  });

  it("derives step completion and what needs the founder from stored rows", async () => {
    const db = base({
      sales_campaigns: [
        {
          session_id: SESSION,
          segments_confirmed_at: "2026-10-02T00:00:00Z",
          autonomous_paused: false,
        },
      ],
      sales_plans: [
        { session_id: SESSION, version: 1, status: "draft" },
        { session_id: SESSION, version: 2, status: "approved" },
      ],
      sales_accounts: [
        { id: "a1", session_id: SESSION, pipeline_stage: "ready_for_approval", notes: null },
        {
          id: "a2",
          session_id: SESSION,
          pipeline_stage: "sequencing",
          notes: "excluded_from_cohort",
        },
        { id: "a3", session_id: SESSION, pipeline_stage: "researching", notes: null },
      ],
      sales_touchpoints: [
        { session_id: SESSION, status: "drafted", sent_at: null },
        { session_id: SESSION, status: "sent", sent_at: "2026-10-03T00:00:00Z" },
        { session_id: OTHER, status: "drafted", sent_at: null },
      ],
      sales_notifications: [
        { session_id: SESSION, kind: "reply", read: false },
        { session_id: SESSION, kind: "reply", read: true },
      ],
      sales_meetings: [{ session_id: SESSION, status: "proposed" }],
      sales_tasks: [{ session_id: SESSION, status: "done" }],
      distribution_campaigns: [
        { session_id: SESSION, status: "approved", autonomous_paused: true },
      ],
      distribution_opportunities: [
        { session_id: SESSION, approval_status: "needs_review", action_status: "draft" },
        { session_id: SESSION, approval_status: "approved", action_status: "published" },
        {
          session_id: SESSION,
          approval_status: "needs_review",
          action_status: "draft",
          agent_skill: "scaffold",
        },
      ],
      outbound_receipts: [
        { session_id: SESSION, status: "sent", sent_at: "2026-10-03T00:00:00Z" },
        { session_id: SESSION, status: "failed", sent_at: null },
      ],
    });

    const p = await getCampaignProgress(db, SESSION);
    expect(p.sales.planStatus).toBe("approved");
    expect(p.sales.accounts).toBe(3);
    expect(p.sales.includedAccounts).toBe(1);
    expect(p.sales.drafts).toEqual({ pending: 1, approved: 0, sent: 1 });
    expect(p.sales.needsYou).toEqual({ replies: 1, meetings: 1, tasks: 0, total: 2 });
    expect(p.sales.nextStep).toBe("needs");
    expect(p.sales.done).toMatchObject({ segments: true, plan: true, find: true, emails: true });
    expect(p.marketing).toEqual({
      planStatus: "approved",
      paused: true,
      opportunities: { needsReview: 1, approved: 0, published: 1 },
    });
    expect(p.outbound).toEqual({ sent: 1, failed: 1, lastSentAt: "2026-10-03T00:00:00Z" });
  });

  it("404s an unknown campaign", async () => {
    await expect(getCampaignProgress(base(), OTHER)).rejects.toMatchObject({ code: "not_found" });
  });
});
