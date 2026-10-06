import { describe, expect, it } from "vitest";
import type { CampaignProgress } from "@/lib/campaigns/progress";
import { getStartedChecklist, hasLaunched, nextStep } from "./nextStep";

type Patch = {
  dossierConfirmed?: boolean;
  sales?: Partial<Omit<CampaignProgress["sales"], "drafts" | "needsYou">> & {
    drafts?: Partial<CampaignProgress["sales"]["drafts"]>;
    needsYou?: Partial<CampaignProgress["sales"]["needsYou"]>;
  };
  marketing?: Partial<Omit<CampaignProgress["marketing"], "opportunities">> & {
    opportunities?: Partial<CampaignProgress["marketing"]["opportunities"]>;
  };
  outbound?: Partial<CampaignProgress["outbound"]>;
};

function progress(patch: Patch = {}): CampaignProgress {
  const needsYou = { replies: 0, meetings: 0, tasks: 0, ...patch.sales?.needsYou };
  return {
    dossierConfirmed: patch.dossierConfirmed ?? true,
    paused: false,
    sales: {
      configured: false,
      paused: false,
      segmentsConfirmed: false,
      planStatus: "none",
      accounts: 0,
      includedAccounts: 0,
      nextStep: "segments",
      done: { segments: false, plan: false, find: false, emails: false, needs: false },
      ...patch.sales,
      drafts: { pending: 0, approved: 0, sent: 0, ...patch.sales?.drafts },
      needsYou: { ...needsYou, total: needsYou.replies + needsYou.meetings + needsYou.tasks },
    },
    marketing: {
      planStatus: "none",
      paused: false,
      ...patch.marketing,
      opportunities: {
        needsReview: 0,
        approved: 0,
        published: 0,
        ...patch.marketing?.opportunities,
      },
    },
    outbound: { sent: 0, failed: 0, lastSentAt: null, ...patch.outbound },
  };
}

const salesReady = { configured: true, segmentsConfirmed: true, planStatus: "approved" as const };

describe("nextStep", () => {
  it("asks for the company profile before anything else", () => {
    expect(nextStep(progress({ dossierConfirmed: false })).key).toBe("confirm-company");
  });

  it("starts a fresh campaign at choosing buyers", () => {
    const step = nextStep(progress());
    expect(step.key).toBe("choose-buyers");
    expect(step.view).toEqual({ area: "sales", tab: "plan" });
  });

  it("follows signup and awareness goals when no job has started", () => {
    expect(nextStep(progress(), ["Get signups"]).key).toBe("start-distribution");
    expect(nextStep(progress(), ["Book meetings", "Build awareness"]).view).toEqual({
      area: "distribution",
      tab: "plan",
    });
    expect(nextStep(progress(), ["Raise funding"]).key).toBe("choose-buyers");
  });

  it("walks the Find customers gates in order", () => {
    expect(nextStep(progress({ sales: { configured: true, segmentsConfirmed: true } })).key).toBe(
      "approve-sales-plan",
    );
    expect(
      nextStep(
        progress({ sales: { configured: true, segmentsConfirmed: true, planStatus: "draft" } }),
      ).cta,
    ).toBe("Review the plan");
    const find = nextStep(progress({ sales: salesReady }));
    expect(find.key).toBe("find-companies");
    expect(find.view).toEqual({ area: "sales", tab: "companies" });
  });

  it("puts people who wrote back first", () => {
    const step = nextStep(
      progress({ sales: { ...salesReady, needsYou: { replies: 2 }, drafts: { pending: 4 } } }),
    );
    expect(step.key).toBe("answer-replies");
    expect(step.title).toBe("Answer 2 replies");
    expect(step.view).toEqual({ area: "inbox" });
    expect(nextStep(progress({ sales: { ...salesReady, needsYou: { meetings: 1 } } })).title).toBe(
      "Confirm 1 meeting",
    );
  });

  it("sends pending drafts to the inbox and approved ones to Emails", () => {
    const review = nextStep(progress({ sales: { ...salesReady, drafts: { pending: 3 } } }));
    expect(review.title).toBe("Review 3 emails");
    expect(review.view).toEqual({ area: "inbox" });
    const send = nextStep(progress({ sales: { ...salesReady, drafts: { approved: 1 } } }));
    expect(send.key).toBe("send-approved");
    expect(send.view).toEqual({ area: "sales", tab: "emails" });
  });

  it("reviews opportunities that need the founder", () => {
    const step = nextStep(
      progress({ marketing: { planStatus: "approved", opportunities: { needsReview: 1 } } }),
    );
    expect(step.title).toBe("Review 1 opportunity");
    expect(step.view).toEqual({ area: "distribution", tab: "opportunities" });
  });

  it("follows the distribution gates when only distribution was started", () => {
    expect(nextStep(progress({ marketing: { planStatus: "proposed" } })).key).toBe(
      "approve-distribution-plan",
    );
    expect(nextStep(progress({ marketing: { planStatus: "approved" } })).key).toBe(
      "find-opportunities",
    );
    // distribution running with results: suggest the other job
    expect(
      nextStep(progress({ marketing: { planStatus: "approved", opportunities: { published: 2 } } }))
        .key,
    ).toBe("choose-buyers");
  });

  it("suggests distribution once outbound is running, then more companies", () => {
    const running = { ...salesReady, accounts: 5, drafts: { sent: 3 } };
    expect(nextStep(progress({ sales: running })).key).toBe("start-distribution");
    expect(
      nextStep(
        progress({
          sales: running,
          marketing: { planStatus: "approved", opportunities: { approved: 1 } },
        }),
      ).key,
    ).toBe("find-more");
  });
});

describe("getStartedChecklist", () => {
  it("tracks the first steps of a new campaign", () => {
    const list = getStartedChecklist(
      progress({ sales: { configured: true, segmentsConfirmed: true } }),
    );
    expect(list?.map((i) => [i.key, i.done])).toEqual([
      ["company", true],
      ["job", true],
      ["plan", false],
      ["first-batch", false],
      ["first-send", false],
    ]);
  });

  it("follows the distribution path when that job came first", () => {
    const list = getStartedChecklist(progress({ marketing: { planStatus: "approved" } }));
    expect(list?.find((i) => i.key === "plan")?.done).toBe(true);
    expect(list?.find((i) => i.key === "first-send")?.label).toBe("Publish your first post");
  });

  it("points a fresh signup campaign at distribution", () => {
    const list = getStartedChecklist(progress(), ["Get signups"]);
    expect(list?.find((i) => i.key === "job")?.view).toEqual({ area: "distribution", tab: "plan" });
    expect(list?.find((i) => i.key === "first-batch")?.label).toBe("Find your first opportunities");
  });

  it("retires after the first send or post", () => {
    expect(hasLaunched(progress({ outbound: { sent: 1 } }))).toBe(true);
    expect(getStartedChecklist(progress({ sales: { drafts: { sent: 1 } } }))).toBeNull();
    expect(
      getStartedChecklist(progress({ marketing: { opportunities: { published: 1 } } })),
    ).toBeNull();
  });
});
