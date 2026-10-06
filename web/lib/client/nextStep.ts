/**
 * Home's "what should I do next to grow?": one recommendation and the
 * get-started checklist, worked out from server-derived campaign progress
 * across both jobs (Find customers and Create distribution). Pure and
 * browser-safe, so the Home screen and its tests share one decision table.
 */

import type { CampaignProgress } from "@/lib/campaigns/progress";
import type { View } from "@/lib/client/routes";

export type NextStepKey =
  | "confirm-company"
  | "answer-replies"
  | "review-emails"
  | "send-approved"
  | "review-opportunities"
  | "choose-buyers"
  | "approve-sales-plan"
  | "find-companies"
  | "start-distribution"
  | "approve-distribution-plan"
  | "find-opportunities"
  | "find-more";

export interface NextStep {
  key: NextStepKey;
  /** the recommendation, as a short imperative */
  title: string;
  /** one plain-language line on why this is next */
  why: string;
  /** label of the single accent button */
  cta: string;
  view: View;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The founder has started Find customers (any Sales setup exists). */
export function salesStarted(p: CampaignProgress): boolean {
  return p.sales.configured || p.sales.segmentsConfirmed || p.sales.planStatus !== "none";
}

/** The founder has started Create distribution (a plan was proposed). */
export function distributionStarted(p: CampaignProgress): boolean {
  return p.marketing.planStatus !== "none";
}

function opportunityTotal(p: CampaignProgress): number {
  const o = p.marketing.opportunities;
  return o.needsReview + o.approved + o.published;
}

/** The next gate on the Find customers path, or null when the path is running. */
function salesGate(p: CampaignProgress): NextStep | null {
  const s = p.sales;
  if (!s.segmentsConfirmed)
    return {
      key: "choose-buyers",
      title: "Tell Kami who you sell to",
      why: "Kami drafts buyer segments from your company profile. Confirm them and it can plan outreach.",
      cta: "Choose your buyers",
      view: { area: "sales", tab: "plan" },
    };
  if (s.planStatus !== "approved")
    return {
      key: "approve-sales-plan",
      title: "Approve your outreach plan",
      why:
        s.planStatus === "draft"
          ? "Your outreach plan is drafted. Kami won't look for companies until you approve it."
          : "Kami turns your buyer segments into an outreach plan for you to approve.",
      cta: s.planStatus === "draft" ? "Review the plan" : "Draft the plan",
      view: { area: "sales", tab: "plan" },
    };
  if (s.drafts.pending + s.drafts.approved + s.drafts.sent === 0)
    return {
      key: "find-companies",
      title: "Find your first companies",
      why: s.accounts
        ? `Kami found ${plural(s.accounts, "company", "companies")}. Pick who to contact and Kami drafts the emails.`
        : "Your plan is approved. Kami researches companies that match it and finds a real contact at each.",
      cta: s.accounts ? "Pick companies" : "Find companies",
      view: { area: "sales", tab: "companies" },
    };
  return null;
}

/** Signup and awareness goals point at distribution, matching onboarding's recommendation. */
function prefersDistribution(goals: readonly string[]): boolean {
  return goals.some((g) => g === "Get signups" || g === "Build awareness");
}

/**
 * Distribution leads when it is the only job started, or when nothing is
 * started yet and the founder's goals recommend it.
 */
function distributionFirst(p: CampaignProgress, goals: readonly string[]): boolean {
  if (distributionStarted(p) && !salesStarted(p)) return true;
  return !salesStarted(p) && !distributionStarted(p) && prefersDistribution(goals);
}

/** The next gate on the Create distribution path, or null when it is running. */
function distributionGate(p: CampaignProgress): NextStep | null {
  const m = p.marketing;
  if (m.planStatus === "none")
    return {
      key: "start-distribution",
      title: "Create distribution",
      why: "Kami finds live conversations where your buyers already are and drafts a useful contribution for each.",
      cta: "Plan distribution",
      view: { area: "distribution", tab: "plan" },
    };
  if (m.planStatus === "proposed")
    return {
      key: "approve-distribution-plan",
      title: "Approve your distribution plan",
      why: "Kami proposed where to show up. It won't look for opportunities until you approve the plan.",
      cta: "Review the plan",
      view: { area: "distribution", tab: "plan" },
    };
  if (opportunityTotal(p) === 0)
    return {
      key: "find-opportunities",
      title: "Find your first opportunities",
      why: "Your distribution plan is approved. Kami scans your surfaces for conversations worth joining.",
      cta: "Find opportunities",
      view: { area: "distribution", tab: "opportunities" },
    };
  return null;
}

/**
 * The single next step. Work that is waiting on the founder comes first (people
 * who replied, then drafts and opportunities to review), then the next gate of
 * the job the founder started, then the other job.
 */
export function nextStep(p: CampaignProgress, goals: readonly string[] = []): NextStep {
  if (!p.dossierConfirmed)
    return {
      key: "confirm-company",
      title: "Confirm your company profile",
      why: "Everything Kami writes is grounded in this profile, so it needs your “That's us” first.",
      cta: "Review profile",
      view: { area: "settings", tab: "company" },
    };

  const { replies, meetings } = p.sales.needsYou;
  if (replies + meetings > 0)
    return {
      key: "answer-replies",
      title: replies
        ? `Answer ${plural(replies, "reply", "replies")}`
        : `Confirm ${plural(meetings, "meeting")}`,
      why: "People who wrote back are your warmest leads. Answer while the conversation is fresh.",
      cta: "Open Inbox",
      view: { area: "inbox" },
    };

  if (p.sales.drafts.pending > 0)
    return {
      key: "review-emails",
      title: `Review ${plural(p.sales.drafts.pending, "email")}`,
      why: "Kami drafted these for you. Nothing is sent until you check and approve each one.",
      cta: "Review emails",
      view: { area: "inbox" },
    };

  if (p.sales.drafts.approved > 0)
    return {
      key: "send-approved",
      title: `Send ${plural(p.sales.drafts.approved, "approved email")}`,
      why: "You approved these. Each send is checked against the kill switch, do-not-contact list and daily cap.",
      cta: "Go to emails",
      view: { area: "sales", tab: "emails" },
    };

  if (p.marketing.opportunities.needsReview > 0)
    return {
      key: "review-opportunities",
      title: `Review ${plural(p.marketing.opportunities.needsReview, "opportunity", "opportunities")}`,
      why: "Kami found live conversations worth joining and drafted a reply for each. They go stale quickly.",
      cta: "Review opportunities",
      view: { area: "distribution", tab: "opportunities" },
    };

  // The job the founder started comes first; goals break the tie when neither has started.
  const [primary, secondary] = distributionFirst(p, goals)
    ? [distributionGate, salesGate]
    : [salesGate, distributionGate];
  return (
    primary(p) ??
    secondary(p) ?? {
      key: "find-more",
      title: "Find more companies",
      why: "Nothing is waiting on you. Keep the pipeline full with another small batch.",
      cta: "Find companies",
      view: { area: "sales", tab: "companies" },
    }
  );
}

export interface ChecklistItem {
  key: "company" | "job" | "plan" | "first-batch" | "first-send";
  label: string;
  done: boolean;
  view: View;
}

/** The founder has sent an email or published a post: the checklist retires. */
export function hasLaunched(p: CampaignProgress): boolean {
  return p.outbound.sent > 0 || p.sales.drafts.sent > 0 || p.marketing.opportunities.published > 0;
}

/** Get-started checklist, shown only until the first send or post (null after). */
export function getStartedChecklist(
  p: CampaignProgress,
  goals: readonly string[] = [],
): ChecklistItem[] | null {
  if (hasLaunched(p)) return null;
  const distribution = distributionFirst(p, goals);
  const planApproved = p.sales.planStatus === "approved" || p.marketing.planStatus === "approved";
  return [
    {
      key: "company",
      label: "Confirm your company profile",
      done: p.dossierConfirmed,
      view: { area: "settings", tab: "company" },
    },
    {
      key: "job",
      label: "Choose a job: find customers or create distribution",
      done: salesStarted(p) || distributionStarted(p),
      view: distribution ? { area: "distribution", tab: "plan" } : { area: "sales", tab: "plan" },
    },
    {
      key: "plan",
      label: "Approve a plan",
      done: planApproved,
      view: distribution ? { area: "distribution", tab: "plan" } : { area: "sales", tab: "plan" },
    },
    {
      key: "first-batch",
      label: distribution ? "Find your first opportunities" : "Find your first companies",
      done: p.sales.accounts > 0 || opportunityTotal(p) > 0,
      view: distribution
        ? { area: "distribution", tab: "opportunities" }
        : { area: "sales", tab: "companies" },
    },
    {
      key: "first-send",
      label: distribution ? "Publish your first post" : "Send your first email",
      done: false,
      view: distribution
        ? { area: "distribution", tab: "opportunities" }
        : { area: "sales", tab: "emails" },
    },
  ];
}
