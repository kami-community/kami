export type MarketingPlatform = "x" | "instagram";
export type OutreachGoal = "drive_signups" | "book_demo" | "awareness";

export interface MarketingConfig {
  id?: string;
  session_id: string;
  platforms: MarketingPlatform[];
  x_boost_budget?: number;
  x_outreach_goal?: OutreachGoal;
  ig_offer_min?: number;
  ig_offer_max?: number;
  ig_niche_keywords?: string[];
  ig_min_followers?: number;
  tone?: string[];
  autonomous_paused?: boolean;
}

export type XLeadStatus =
  "identified" | "approved" | "contacted" | "in_conversation" | "converted" | "lost";

export type CreatorStatus =
  "identified" | "contacted" | "negotiating" | "agreed" | "content_live" | "paid" | "completed";

export type CrmEntryType = "x_lead" | "creator";

export interface MarketingCrmEntry {
  id: string;
  session_id: string;
  type: CrmEntryType;
  platform: MarketingPlatform;
  handle: string;
  name?: string;
  followers?: number;
  engagement_rate?: number;
  niche_match_score?: number;
  relevance_reasoning?: string;
  offer_amount?: number;
  status: XLeadStatus | CreatorStatus;
  calendar_event_id?: string;
  created_at: string;
  updated_at: string;
}

export type ConversationStatus =
  | "idle"
  | "first_msg_drafted"
  | "first_msg_reviewed"
  | "first_msg_sent"
  | "awaiting_reply"
  | "reply_received"
  | "response_drafted"
  | "response_sent"
  | "concluded"
  | "escalated"
  | "stalled";

export type ConversationGoal = "negotiate_collab" | "drive_signup" | "book_demo";

export interface Conversation {
  id: string;
  crm_entry_id: string;
  platform: MarketingPlatform;
  goal: ConversationGoal;
  persona_config?: Record<string, unknown>;
  budget_min?: number;
  budget_max?: number;
  status: ConversationStatus;
  escalation_reason?: string;
  created_at: string;
  updated_at: string;
}

export type MessageSender = "kami" | "lead";

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender: MessageSender;
  content: string;
  platform_message_id?: string;
  status: "sent" | "failed";
  sent_at: string;
}

export type BoostStatus = "pending" | "live" | "completed";

export interface BoostCampaign {
  id: string;
  session_id: string;
  post_id: string;
  post_text: string;
  budget: number;
  status: BoostStatus;
  impressions?: number;
  clicks?: number;
  spend?: number;
  created_at: string;
  updated_at: string;
}

export interface XPost {
  id: string;
  text: string;
  public_metrics: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
    impression_count: number;
  };
  created_at: string;
}

export type CampaignTab = "overview" | "sales" | "marketing";
