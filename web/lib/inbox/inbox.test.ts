import { describe, expect, it } from "vitest";
import { getCampaignProgress } from "@/lib/campaigns/progress";
import { fakeDb } from "@/lib/testing/fakeDb";
import { getInbox } from "./inbox";

const SESSION = "6f1c1d0e-2a51-4f6b-9a8e-0d1f0c9b7a11";
const OTHER = "0b8e1f2c-3d4a-4b5c-8d6e-7f8091a2b3c4";

function seeded() {
  return fakeDb({
    agent_sessions: [{ id: SESSION, paused: false, dossier_confirmed_at: "2026-10-01T00:00:00Z" }],
    sales_campaigns: [],
    sales_plans: [],
    sales_accounts: [],
    sales_touchpoints: [
      {
        id: "t1",
        session_id: SESSION,
        channel: "email",
        step: 1,
        status: "drafted",
        sent_at: null,
        draft_subject: "Quick question about docs",
        reviewer_verdict: null,
        created_at: "2026-10-03T00:00:00Z",
        sales_sequence_enrollments: {
          status: "active",
          sales_contacts: { name: "Ada", email: "ada@example.com" },
          sales_accounts: { name: "Acme" },
        },
      },
      {
        id: "t2",
        session_id: SESSION,
        channel: "email",
        step: 1,
        status: "approved",
        sent_at: null,
      },
      {
        id: "t3",
        session_id: SESSION,
        channel: "email",
        step: 1,
        status: "sent",
        sent_at: "2026-10-03T00:00:00Z",
      },
      { id: "t4", session_id: OTHER, channel: "email", step: 1, status: "drafted", sent_at: null },
    ],
    sales_notifications: [
      {
        id: "n1",
        session_id: SESSION,
        kind: "reply",
        title: "Ada replied",
        body: "Sounds   interesting,\n tell me more",
        entity_type: "sales_conversation",
        entity_id: "c1",
        read: false,
        created_at: "2026-10-04T00:00:00Z",
      },
      { id: "n2", session_id: SESSION, kind: "reply", title: "Old", read: true },
      { id: "n3", session_id: OTHER, kind: "reply", title: "Other campaign", read: false },
    ],
    sales_conversations: [
      { id: "c1", session_id: SESSION, channel: "email", status: "open" },
      { id: "c2", session_id: OTHER, channel: "email", status: "open" },
    ],
    sales_meetings: [
      {
        id: "m1",
        session_id: SESSION,
        status: "proposed",
        title: null,
        attendee_email: "ada@example.com",
      },
      { id: "m2", session_id: SESSION, status: "scheduled" },
    ],
    sales_tasks: [
      { id: "k1", session_id: SESSION, title: "Send the deck", status: "open", priority: "high" },
      { id: "k2", session_id: SESSION, title: "Done", status: "done", priority: "medium" },
    ],
    distribution_campaigns: [],
    distribution_opportunities: [
      {
        id: "o1",
        session_id: SESSION,
        platform: "reddit",
        why_now: "Thread asking for docs tools",
        suggested_action: "Share a practical answer",
        draft: "…",
        approval_status: "needs_review",
        action_status: "draft",
        outcome: "none",
        agent_skill: "reddit_distribution",
      },
      {
        id: "o2",
        session_id: SESSION,
        platform: "x",
        approval_status: "needs_review",
        action_status: "draft",
        agent_skill: "scaffold",
      },
      {
        id: "o3",
        session_id: SESSION,
        platform: "x",
        approval_status: "approved",
        action_status: "published",
      },
    ],
    outbound_receipts: [],
  }).db;
}

describe("getInbox", () => {
  it("lists only this campaign's waiting work, most urgent kind first", async () => {
    const { items, counts } = await getInbox(seeded(), SESSION);
    expect(items.map((i) => i.key)).toEqual([
      "reply:n1",
      "meeting:m1",
      "draft:t1",
      "opportunity:o1",
      "task:k1",
    ]);
    expect(counts).toEqual({ reply: 1, meeting: 1, draft: 1, opportunity: 1, task: 1, total: 5 });
  });

  it("gives each row a title, one line of context and its detail record", async () => {
    const { items } = await getInbox(seeded(), SESSION);
    const reply = items.find((i) => i.type === "reply");
    expect(reply?.context).toBe("Sounds interesting, tell me more");
    expect(reply?.type === "reply" && reply.conversation?.id).toBe("c1");
    const draft = items.find((i) => i.type === "draft");
    expect(draft?.title).toBe("Quick question about docs");
    expect(draft?.context).toBe("To Ada at Acme · Email 1 · Not checked yet");
    expect(items.find((i) => i.type === "meeting")?.title).toBe("Meeting request");
    expect(items.find((i) => i.type === "opportunity")?.context).toMatch(/^Reddit · /);
    expect(items.find((i) => i.type === "task")?.context).toBe("high priority");
  });

  it("agrees with the sidebar count from campaign progress", async () => {
    const db = seeded();
    const [{ counts }, progress] = await Promise.all([
      getInbox(db, SESSION),
      getCampaignProgress(db, SESSION),
    ]);
    expect(counts.total).toBe(
      progress.sales.needsYou.total +
        progress.sales.drafts.pending +
        progress.marketing.opportunities.needsReview,
    );
  });

  it("is empty for a quiet campaign", async () => {
    const { db } = fakeDb({});
    expect(await getInbox(db, SESSION)).toEqual({
      items: [],
      counts: { reply: 0, meeting: 0, draft: 0, opportunity: 0, task: 0, total: 0 },
    });
  });
});
