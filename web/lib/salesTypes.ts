import type { StoredEmailVerification } from "@/lib/domain/contacts";

export type SalesMotion = "outbound_email" | "signal_outreach" | "x_dm" | "multi_channel";

export type SalesChannel = "email" | "x";

export type PipelineStage =
  | "researching"
  | "ready_for_approval"
  | "sequencing"
  | "sent"
  | "engaged"
  | "qualified"
  | "meeting_proposed"
  | "invited"
  | "accepted"
  | "closed_won"
  | "closed_lost"
  | "invalid"
  | "suppressed";

export type SequenceEnrollmentStatus =
  | "draft"
  | "awaiting_approval"
  | "eligible"
  | "sent_step_1"
  | "waiting"
  | "sent_step_2"
  | "completed"
  | "replied"
  | "bounced"
  | "unsubscribed"
  | "suppressed"
  | "meeting_created"
  | "cancelled";

export type MeetingStatus =
  | "proposed"
  /** Invite claimed; the calendar call is in flight. */
  | "scheduling"
  /** Calendar event exists (provider receipt recorded) and the invite was emailed. */
  | "scheduled"
  | "held"
  | "invited"
  | "accepted"
  | "declined"
  | "rescheduled"
  | "cancelled"
  | "no_show"
  | "completed";

export type SalesPlanStatus = "draft" | "approved" | "superseded";

export const REPLY_CLASSIFICATION_LABELS = [
  "positive",
  "objection",
  "information_request",
  "referral",
  "not_now",
  "unsubscribe",
  "negative",
  "spam_risk",
] as const;

export type ReplyClassificationLabel = (typeof REPLY_CLASSIFICATION_LABELS)[number];

export type BuyingGroupRole = "champion" | "economic_buyer" | "evaluator" | "blocker" | "sponsor";

export type ApprovalScope =
  | "first_send"
  | "sequence_activation"
  | "x_dm"
  | "calendar_invite"
  | "claims_change"
  | "target_cohort";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "revoked";

export type SalesTaskStatus = "open" | "in_progress" | "done" | "cancelled";

export type SalesTaskPriority = "low" | "medium" | "high" | "urgent";

export type NotificationKind =
  "reply" | "escalation" | "meeting" | "approval_required" | "cap_warning" | "policy_block";

export interface SalesAutonomyPolicy {
  paused: boolean;
  auto_followups: boolean;
  require_first_send_approval: boolean;
}

export interface SalesIcp {
  titles: string[];
  industries: string[];
  size?: string;
  geo?: string;
}

/** Lightweight segment stub on campaign config (full shape in salesSegments.ts). */
export interface SalesSegmentSummary {
  key: string;
  name: string;
  why_fit: string;
  motion: "b2b_sales_assisted" | "plg_self_serve";
  target_persona: string;
  target_count: number;
}

export interface DealRange {
  min?: number;
  max?: number;
  currency?: string;
}

export interface SenderIdentity {
  name: string;
  email?: string;
  title?: string;
  company?: string;
}

export interface SalesCampaignConfig {
  id?: string;
  session_id: string;
  client_id?: string;
  offer: string;
  icp: SalesIcp;
  geo?: string;
  exclusions?: string[];
  deal_range?: DealRange;
  approved_claims?: string[];
  target_quantity?: number;
  sender_identity?: SenderIdentity;
  daily_send_cap?: number;
  allowed_channels?: SalesChannel[];
  autonomy?: SalesAutonomyPolicy;
  autonomous_paused?: boolean;
  pipeline_stage?: PipelineStage;
  /** Confirmed outbound segments (failsafe gate before discovery). */
  segments?: SalesSegmentSummary[] | null;
  segments_confirmed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SalesPlanTier {
  tier: 1 | 2 | 3;
  label: string;
  criteria: string;
  target_count: number;
  channels: SalesChannel[];
}

export interface SalesPlanMotion {
  motion: SalesMotion;
  rationale: string;
  primary_channel: SalesChannel;
}

export interface EstimatedActivity {
  accounts_to_research: number;
  contacts_expected: number;
  sends_per_week: number;
  followups_per_week: number;
}

export interface SalesPlan {
  id?: string;
  session_id: string;
  sales_campaign_id?: string;
  version: number;
  motions: SalesPlanMotion[];
  tiers: SalesPlanTier[];
  channel_rationale: string;
  risks: string[];
  prerequisites: string[];
  estimated_activity: EstimatedActivity;
  approval_scope: ApprovalScope[];
  status: SalesPlanStatus;
  revise_note?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SalesAccount {
  id?: string;
  session_id: string;
  sales_campaign_id?: string;
  client_id?: string;
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  geo?: string;
  pipeline_stage: PipelineStage;
  tier?: 1 | 2 | 3;
  segment_key?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AccountSignal {
  id?: string;
  account_id: string;
  session_id: string;
  provider: string;
  signal_type: string;
  detail: string;
  source_url?: string;
  observed_at?: string;
  captured_at?: string;
  confidence?: number;
  evidence_text?: string;
  created_at?: string;
}

export interface SalesContact {
  id?: string;
  session_id: string;
  account_id?: string;
  sales_campaign_id?: string;
  name?: string;
  title?: string;
  email?: string;
  handle?: string;
  channel?: SalesChannel;
  email_verification?: StoredEmailVerification;
  do_not_contact?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BuyingGroupMember {
  id?: string;
  session_id: string;
  account_id: string;
  contact_id: string;
  role: BuyingGroupRole;
  evidence_refs?: string[];
  confidence?: number;
  created_at?: string;
}

export interface LeadScoreFactors {
  fit: number;
  intent: number;
  contactability: number;
  priority: number;
}

export interface LeadScore {
  id?: string;
  session_id: string;
  account_id?: string;
  contact_id?: string;
  model_version: string;
  factors: LeadScoreFactors;
  explanation: string;
  evidence_refs?: string[];
  recommended_tier?: 1 | 2 | 3;
  recommended_channel?: SalesChannel;
  created_at?: string;
}

export interface Sequence {
  id?: string;
  session_id: string;
  sales_campaign_id?: string;
  name: string;
  channel: SalesChannel;
  steps: { step: number; delay_days: number; template_ref?: string }[];
  stop_on_reply: boolean;
  stop_on_bounce: boolean;
  stop_on_unsubscribe: boolean;
  status: "draft" | "active" | "paused" | "archived";
  created_at?: string;
  updated_at?: string;
}

export interface SequenceEnrollment {
  id?: string;
  session_id: string;
  sequence_id: string;
  contact_id: string;
  account_id?: string;
  status: SequenceEnrollmentStatus;
  current_step: number;
  enrolled_at?: string;
  updated_at?: string;
}

export type TouchpointStatus = "drafted" | "approved" | "sent" | "failed";

export interface ReviewerVerdict {
  approved: boolean;
  score: number;
  failed_criteria: string[];
  required_fixes: string[];
  reviewed_at: string;
}

export interface EmailDraft {
  subject: string;
  body: string;
  cta: string;
  evidence_refs: string[];
  sequence_step: number;
  signal_ref?: string;
}

export interface Touchpoint {
  id?: string;
  session_id: string;
  enrollment_id: string;
  channel: SalesChannel;
  step: number;
  status?: TouchpointStatus;
  draft_id?: string;
  draft_subject?: string;
  draft_body?: string;
  draft_cta?: string;
  draft_metadata?: Record<string, unknown>;
  reviewer_verdict?: ReviewerVerdict;
  approved_at?: string;
  provider_receipt_id?: string;
  sent_at?: string;
  immutable: boolean;
  created_at?: string;
}

export interface SalesConversation {
  id?: string;
  session_id: string;
  account_id?: string;
  contact_id?: string;
  channel: SalesChannel;
  status: string;
  last_message_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SalesMessage {
  id?: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  content: string;
  provider_message_id?: string;
  classification_id?: string;
  sent_at?: string;
  created_at?: string;
}

export interface ReplyClassification {
  id?: string;
  session_id: string;
  message_id: string;
  label: ReplyClassificationLabel;
  confidence?: number;
  escalation_required: boolean;
  draft_response?: string;
  created_at?: string;
}

export interface Meeting {
  id?: string;
  session_id: string;
  account_id?: string;
  contact_id?: string;
  conversation_id?: string;
  title?: string;
  status: MeetingStatus;
  proposed_at?: string;
  scheduled_at?: string;
  calendar_event_id?: string;
  provider_receipt?: Record<string, unknown>;
  attendee_email?: string;
  ends_at?: string;
  time_zone?: string;
  meeting_link?: string;
  last_error?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SalesTask {
  id?: string;
  session_id: string;
  account_id?: string;
  contact_id?: string;
  conversation_id?: string;
  title: string;
  description?: string;
  status: SalesTaskStatus;
  priority: SalesTaskPriority;
  due_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SalesNotification {
  id?: string;
  session_id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  entity_type?: string;
  entity_id?: string;
  read: boolean;
  created_at?: string;
}

export interface Approval {
  id?: string;
  session_id: string;
  sales_campaign_id?: string;
  scope: ApprovalScope;
  entity_type: string;
  entity_id: string;
  status: ApprovalStatus;
  requested_by?: string;
  decided_by?: string;
  decided_at?: string;
  notes?: string;
  created_at?: string;
}

export interface AuditEvent {
  id?: string;
  session_id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
}

export interface ExecutionReceipt {
  id?: string;
  session_id: string;
  sales_campaign_id?: string;
  touchpoint_id?: string;
  channel: SalesChannel;
  provider: string;
  provider_message_id?: string;
  recipient: string;
  status: "sent" | "failed" | "bounced";
  raw?: Record<string, unknown>;
  sent_at?: string;
  created_at?: string;
}

export interface SuppressionEntry {
  id?: string;
  session_id: string;
  channel?: SalesChannel;
  identifier: string;
  reason: string;
  source: string;
  scope?: string;
  actor?: string;
  created_at?: string;
}

/** Permitted pipeline stage transitions (server-enforced). */
export const PIPELINE_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  researching: ["ready_for_approval", "invalid", "suppressed"],
  ready_for_approval: ["sequencing", "suppressed", "invalid"],
  sequencing: ["sent", "suppressed", "invalid"],
  sent: ["engaged", "suppressed", "closed_lost"],
  engaged: ["qualified", "closed_lost", "suppressed"],
  qualified: ["meeting_proposed", "closed_lost"],
  meeting_proposed: ["invited", "closed_lost"],
  invited: ["accepted", "closed_lost"],
  accepted: ["closed_won", "closed_lost"],
  closed_won: [],
  closed_lost: [],
  invalid: [],
  suppressed: [],
};
