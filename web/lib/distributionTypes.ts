/** Soft vocabulary Hermes may choose; free-text goals also allowed. */
export type DistributionGoalKey = "launch" | "early_users" | "credibility" | "waitlist" | "other";

/** @deprecated Prefer DistributionGoalKey; goal is now a flexible string. */
export type DistributionGoal = DistributionGoalKey | string;

export type DistributionPlatform =
  "x" | "reddit" | "hackernews" | "linkedin" | "producthunt" | "discord";

export type DistributionPlanStatus = "proposed" | "approved" | "superseded";

export type DistributionPlanSource = "hermes" | "fallback";

export type DistributionApprovalStatus = "needs_review" | "approved" | "skipped";

export type DistributionActionStatus = "draft" | "ready" | "posted_manual" | "published" | "failed";

export type DistributionOutcome =
  "none" | "posted" | "got_reply" | "got_interest" | "got_signup" | "not_relevant" | "skipped";

/** Hermes-recommended campaign plan (stored on distribution_campaigns). */
export interface DistributionPlan {
  id?: string;
  session_id: string;
  /** Hermes-chosen key or free-text slug. */
  goal: string;
  /** Plain-English job label for the founder. */
  goal_label?: string;
  angle?: string;
  surfaces?: DistributionPlatform[];
  rationale?: string;
  why_these_surfaces?: string;
  status?: DistributionPlanStatus;
  revise_note?: string;
  source?: DistributionPlanSource;
  hermes_session_id?: string | null;
  autonomous_paused?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Alias used by MarketingPanel / APIs. */
export type DistributionCampaignConfig = DistributionPlan;

export interface DistributionOpportunity {
  id: string;
  session_id: string;
  campaign_id?: string | null;
  platform: DistributionPlatform;
  source_url: string;
  evidence?: string | null;
  why_now: string;
  suggested_action: string;
  draft: string;
  risks?: string | null;
  /** Current viral/format pattern Hermes chose for this draft. */
  format_used?: string | null;
  /** One-line why that format fits this week / this source. */
  format_why?: string | null;
  approval_status: DistributionApprovalStatus;
  action_status: DistributionActionStatus;
  outcome: DistributionOutcome;
  published_url?: string | null;
  agent_skill?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const DISTRIBUTION_GOAL_LABELS: Record<DistributionGoalKey, string> = {
  launch: "Launch",
  early_users: "Early users",
  credibility: "Credibility",
  waitlist: "Waitlist signups",
  other: "Other",
};

export const DISTRIBUTION_PLATFORMS: DistributionPlatform[] = [
  "x",
  "reddit",
  "hackernews",
  "linkedin",
  "producthunt",
  "discord",
];

export function normalizeSurfaces(raw: unknown): DistributionPlatform[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is DistributionPlatform =>
      DISTRIBUTION_PLATFORMS.includes(p as DistributionPlatform),
    )
    .slice(0, 6);
}
