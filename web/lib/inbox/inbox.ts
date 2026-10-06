import type { Db } from "@/lib/db/client";
import type { DistributionOpportunity } from "@/lib/distributionTypes";
import { AppError } from "@/lib/http/errors";
import type {
  Meeting,
  ReviewerVerdict,
  SalesConversation,
  SalesNotification,
  SalesTask,
} from "@/lib/salesTypes";

/**
 * The founder's Inbox: everything waiting on them across both jobs, as one
 * list. The selection rules match `getCampaignProgress` exactly (pending
 * drafts, unread notifications, proposed meetings, open tasks, researched
 * opportunities that need review), so the counts here equal the sidebar's.
 * Read-only: every action on an item goes through that item's own flow.
 */

import { INBOX_ORDER, type InboxItemType } from "@/lib/domain/inbox";

export { INBOX_ORDER, type InboxItemType };

/** An email draft with its recipient, as the Emails review card shows it. */
export interface InboxDraft {
  id: string;
  step: number;
  status: string;
  draft_subject?: string;
  draft_body?: string;
  draft_cta?: string;
  draft_metadata?: { source?: "agent" | "template"; notes?: string | null } | null;
  reviewer_verdict?: ReviewerVerdict | null;
  approved_at?: string;
  created_at?: string;
  sales_sequence_enrollments?: {
    status: string;
    sales_contacts?: { name?: string; email?: string };
    sales_accounts?: { name?: string; domain?: string };
  };
}

interface ItemBase {
  /** stable across reloads: `<type>:<row id>` */
  key: string;
  title: string;
  /** one line of context under the title */
  context: string;
  /** when it arrived (ISO), for sorting and "2h ago" */
  at: string | null;
}

export type InboxItem =
  | (ItemBase & {
      type: "reply";
      notification: SalesNotification;
      conversation: SalesConversation | null;
    })
  | (ItemBase & { type: "meeting"; meeting: Meeting })
  | (ItemBase & { type: "draft"; draft: InboxDraft })
  | (ItemBase & { type: "opportunity"; opportunity: DistributionOpportunity })
  | (ItemBase & { type: "task"; task: SalesTask });

export interface InboxSummary {
  items: InboxItem[];
  counts: Record<InboxItemType, number> & { total: number };
}

/** People waiting come first, then work Kami drafted, then the founder's own tasks. */

type Row = Record<string, unknown>;

function rows(result: { data: unknown; error: { message: string } | null }, what: string): Row[] {
  if (result.error)
    throw new AppError("internal", `could not load ${what}: ${result.error.message}`);
  return (result.data as Row[] | null) ?? [];
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const oneLine = (text: string | undefined, max = 140): string => {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const PLATFORMS: Record<string, string> = {
  x: "X",
  reddit: "Reddit",
  hackernews: "Hacker News",
  linkedin: "LinkedIn",
  producthunt: "Product Hunt",
  discord: "Discord",
};

function draftItem(row: Row): InboxItem {
  const draft = row as unknown as InboxDraft;
  const contact = draft.sales_sequence_enrollments?.sales_contacts;
  const account = draft.sales_sequence_enrollments?.sales_accounts;
  const who = contact?.name ?? account?.name ?? "a contact";
  const at =
    account?.name && contact?.name && account.name !== contact.name ? ` at ${account.name}` : "";
  const verdict = draft.reviewer_verdict;
  const state = !verdict ? "Not checked yet" : verdict.approved ? "Passes review" : "Needs fixes";
  return {
    type: "draft",
    key: `draft:${draft.id}`,
    title: draft.draft_subject?.trim() || `Email to ${who}`,
    context: `To ${who}${at} · Email ${draft.step} · ${state}`,
    at: str(row.created_at) ?? null,
    draft,
  };
}

function replyItem(row: Row, conversations: Map<string, SalesConversation>): InboxItem {
  const notification: SalesNotification = {
    id: row.id as string,
    session_id: row.session_id as string,
    kind: row.kind as SalesNotification["kind"],
    title: row.title as string,
    body: str(row.body),
    entity_type: str(row.entity_type),
    entity_id: str(row.entity_id),
    read: Boolean(row.read),
    created_at: str(row.created_at),
  };
  const conversation =
    notification.entity_type === "sales_conversation" && notification.entity_id
      ? (conversations.get(notification.entity_id) ?? null)
      : null;
  return {
    type: "reply",
    key: `reply:${notification.id}`,
    title: notification.title,
    context: oneLine(notification.body) || "Open the conversation to reply.",
    at: notification.created_at ?? null,
    notification,
    conversation,
  };
}

function meetingItem(row: Row): InboxItem {
  const meeting = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, v ?? undefined]),
  ) as unknown as Meeting;
  return {
    type: "meeting",
    key: `meeting:${meeting.id}`,
    title: meeting.title || "Meeting request",
    context: meeting.attendee_email
      ? `With ${meeting.attendee_email} · pick a time and send the invite`
      : "Pick a time and send the invite",
    at: meeting.proposed_at ?? meeting.created_at ?? null,
    meeting,
  };
}

function taskItem(row: Row): InboxItem {
  const task: SalesTask = {
    id: row.id as string,
    session_id: row.session_id as string,
    account_id: str(row.account_id),
    contact_id: str(row.contact_id),
    conversation_id: str(row.conversation_id),
    title: row.title as string,
    description: str(row.description),
    status: row.status as SalesTask["status"],
    priority: row.priority as SalesTask["priority"],
    due_at: str(row.due_at),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
  };
  const due = task.due_at ? `Due ${task.due_at.slice(0, 10)}` : null;
  return {
    type: "task",
    key: `task:${task.id}`,
    title: task.title,
    context:
      [
        due,
        task.priority !== "medium" ? `${task.priority} priority` : null,
        oneLine(task.description, 90) || null,
      ]
        .filter(Boolean)
        .join(" · ") || "Open task",
    at: task.created_at ?? null,
    task,
  };
}

function opportunityItem(row: Row): InboxItem {
  const opportunity: DistributionOpportunity = {
    id: row.id as string,
    session_id: row.session_id as string,
    campaign_id: (row.campaign_id as string | null) ?? null,
    platform: row.platform as DistributionOpportunity["platform"],
    source_url: (row.source_url as string) ?? "",
    evidence: (row.evidence as string | null) ?? null,
    why_now: (row.why_now as string) ?? "",
    suggested_action: (row.suggested_action as string) ?? "",
    draft: (row.draft as string) ?? "",
    risks: (row.risks as string | null) ?? null,
    format_used: (row.format_used as string | null) ?? null,
    format_why: (row.format_why as string | null) ?? null,
    approval_status: row.approval_status as DistributionOpportunity["approval_status"],
    action_status: row.action_status as DistributionOpportunity["action_status"],
    outcome: (row.outcome as DistributionOpportunity["outcome"]) ?? "none",
    published_url: (row.published_url as string | null) ?? null,
    agent_skill: (row.agent_skill as string | null) ?? null,
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
  };
  const platform = PLATFORMS[opportunity.platform] ?? opportunity.platform;
  return {
    type: "opportunity",
    key: `opportunity:${opportunity.id}`,
    title: oneLine(opportunity.suggested_action, 100) || `Join a conversation on ${platform}`,
    context: `${platform} · ${oneLine(opportunity.why_now, 110)}`,
    at: opportunity.created_at ?? null,
    opportunity,
  };
}

/** Everything waiting on the founder in this campaign, most urgent kind first, newest first within a kind. */
export async function getInbox(db: Db, sessionId: string): Promise<InboxSummary> {
  const [touchpoints, notifications, meetings, tasks, opportunities] = await Promise.all([
    db
      .from("sales_touchpoints")
      .select(
        "*, sales_sequence_enrollments(status, sales_contacts(name, email), sales_accounts(name, domain))",
      )
      .eq("session_id", sessionId),
    db.from("sales_notifications").select("*").eq("session_id", sessionId).eq("read", false),
    db.from("sales_meetings").select("*").eq("session_id", sessionId).eq("status", "proposed"),
    db
      .from("sales_tasks")
      .select("*")
      .eq("session_id", sessionId)
      .in("status", ["open", "in_progress"]),
    db
      .from("distribution_opportunities")
      .select("*")
      .eq("session_id", sessionId)
      .eq("approval_status", "needs_review"),
  ]);

  const notificationRows = rows(notifications, "notifications");
  const conversationIds = [
    ...new Set(
      notificationRows
        .filter((n) => n.entity_type === "sales_conversation" && typeof n.entity_id === "string")
        .map((n) => n.entity_id as string),
    ),
  ];
  const conversations = new Map<string, SalesConversation>();
  if (conversationIds.length) {
    const result = await db
      .from("sales_conversations")
      .select(
        "id, session_id, account_id, contact_id, channel, status, last_message_at, created_at, updated_at",
      )
      .eq("session_id", sessionId)
      .in("id", conversationIds);
    for (const c of rows(result, "conversations"))
      conversations.set(c.id as string, c as unknown as SalesConversation);
  }

  // same rules as getCampaignProgress: not sent and not yet approved
  const pendingDrafts = rows(touchpoints, "drafts").filter(
    (t) => !t.sent_at && t.status !== "sent" && t.status !== "approved",
  );
  // starter templates are not research: never waiting on the founder
  const researched = rows(opportunities, "opportunities").filter(
    (o) => o.agent_skill !== "scaffold",
  );

  const items: InboxItem[] = [
    ...notificationRows.map((n) => replyItem(n, conversations)),
    ...rows(meetings, "meetings").map(meetingItem),
    ...pendingDrafts.map(draftItem),
    ...researched.map(opportunityItem),
    ...rows(tasks, "tasks").map(taskItem),
  ];
  items.sort(
    (a, b) =>
      INBOX_ORDER.indexOf(a.type) - INBOX_ORDER.indexOf(b.type) ||
      (b.at ?? "").localeCompare(a.at ?? ""),
  );

  const counts = { reply: 0, meeting: 0, draft: 0, opportunity: 0, task: 0, total: items.length };
  for (const item of items) counts[item.type] += 1;
  return { items, counts };
}
