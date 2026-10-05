export type DistributionGoal = "launch" | "early_users" | "credibility" | "waitlist";

export type DistributionPlatform =
  "x" | "reddit" | "hackernews" | "linkedin" | "producthunt" | "discord";

export type DistributionApprovalStatus = "needs_review" | "approved" | "skipped";

export type DistributionActionStatus = "draft" | "ready" | "posted_manual" | "published" | "failed";

export type DistributionOutcome =
  "none" | "posted" | "got_reply" | "got_interest" | "got_signup" | "not_relevant" | "skipped";

export interface DistributionCampaignConfig {
  id?: string;
  session_id: string;
  goal: DistributionGoal;
  angle?: string;
  surfaces?: DistributionPlatform[];
  autonomous_paused?: boolean;
  created_at?: string;
  updated_at?: string;
}

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
  approval_status: DistributionApprovalStatus;
  action_status: DistributionActionStatus;
  outcome: DistributionOutcome;
  published_url?: string | null;
  agent_skill?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const DISTRIBUTION_GOAL_LABELS: Record<DistributionGoal, string> = {
  launch: "Launch",
  early_users: "Early users",
  credibility: "Credibility",
  waitlist: "Waitlist signups",
};
