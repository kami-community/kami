import type { CampaignProgress } from "@/lib/campaigns/progress";
import type { SalesTab } from "@/lib/client/routes";

/**
 * The Find-customers setup loop (Who → Plan → Companies → Emails) as a
 * stepper, derived only from server progress. Pure and browser-safe;
 * unit-tested in salesSteps.test.ts.
 */

export type SalesStepKey = "who" | "plan" | "companies" | "emails";
export type SalesStepState = "done" | "current" | "open" | "locked";

export interface SalesStep {
  key: SalesStepKey;
  num: number;
  label: string;
  /** the tab that holds this step */
  tab: SalesTab;
  state: SalesStepState;
  /** why the step is locked, in plain words */
  hint?: string;
}

export interface SalesGates {
  configured: boolean;
  segmentsConfirmed: boolean;
  planApproved: boolean;
  /** drafts exist (pending, approved or sent) */
  drafted: boolean;
  sent: boolean;
}

export function salesGates(progress: CampaignProgress | null, configured: boolean): SalesGates {
  const s = progress?.sales;
  const drafts = s?.drafts;
  return {
    configured: configured || Boolean(s?.configured),
    segmentsConfirmed: Boolean(s?.segmentsConfirmed),
    planApproved: s?.planStatus === "approved",
    drafted: (drafts?.pending ?? 0) + (drafts?.approved ?? 0) + (drafts?.sent ?? 0) > 0,
    sent: (drafts?.sent ?? 0) > 0,
  };
}

export const LOCK_HINTS = {
  plan: "Confirm who you sell to first",
  companies: "Approve the plan first",
  emails: "Pick companies with a contact email first",
} as const;

/** The four setup steps with done / current / open / locked state. */
export function salesSteps(g: SalesGates): SalesStep[] {
  const raw: Omit<SalesStep, "state">[] = [
    { key: "who", num: 1, label: "Who you sell to", tab: "plan" },
    { key: "plan", num: 2, label: "Plan", tab: "plan" },
    { key: "companies", num: 3, label: "Companies", tab: "companies" },
    { key: "emails", num: 4, label: "Emails", tab: "emails" },
  ];
  const done: Record<SalesStepKey, boolean> = {
    who: g.configured && g.segmentsConfirmed,
    plan: g.planApproved,
    companies: g.drafted,
    emails: g.sent,
  };
  const unlocked: Record<SalesStepKey, boolean> = {
    who: true,
    plan: g.configured && g.segmentsConfirmed,
    companies: g.planApproved,
    emails: g.planApproved && g.drafted,
  };
  const hints: Record<SalesStepKey, string | undefined> = {
    who: undefined,
    plan: LOCK_HINTS.plan,
    companies: LOCK_HINTS.companies,
    emails: g.planApproved ? LOCK_HINTS.emails : LOCK_HINTS.companies,
  };
  const currentKey = raw.find((s) => unlocked[s.key] && !done[s.key])?.key ?? null;
  return raw.map((s) => {
    if (!unlocked[s.key]) {
      return { ...s, state: "locked", hint: hints[s.key] };
    }
    if (s.key === currentKey) return { ...s, state: "current" };
    return { ...s, state: done[s.key] ? "done" : "open" };
  });
}

/** After the first real send the stepper shrinks to a one-line summary. */
export function stepperCollapsed(g: SalesGates): boolean {
  return g.sent;
}

/** Why a later tab is locked, and the button that takes the founder to the step that unlocks it. */
function beforePlan(g: SalesGates): { hint: string; cta: string } {
  if (!g.configured)
    return { hint: "Tell Kami who you sell to first", cta: "Tell Kami who you sell to" };
  if (!g.segmentsConfirmed) return { hint: LOCK_HINTS.plan, cta: "Confirm who you sell to" };
  return { hint: LOCK_HINTS.companies, cta: "Go to Plan" };
}

/** Why a tab cannot be used yet (null when it can), and which tab unlocks it. */
export function tabGate(
  tab: SalesTab,
  g: SalesGates,
): { hint: string; goTo: SalesTab; cta: string } | null {
  if ((tab === "companies" || tab === "emails" || tab === "pipeline") && !g.planApproved) {
    return { ...beforePlan(g), goTo: "plan" };
  }
  if (tab === "emails" && !g.drafted)
    return { hint: LOCK_HINTS.emails, cta: "Go to Companies", goTo: "companies" };
  return null;
}
