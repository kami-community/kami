import type { Db } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import type { InboundEmail } from "@/lib/ports/email";
import { addSuppression } from "@/lib/outbound/suppressions";
import { triageReply } from "./triage";

/**
 * Inbound replies to sales outreach. The AgentMail webhook and the polling job
 * both land here; messages are de-duplicated by provider message id.
 */

export interface ReplyInput {
  sessionId: string;
  contactId: string | null;
  accountId: string | null;
  fromEmail: string | null;
  subject?: string;
  content: string;
  providerMessageId?: string;
  receivedAt?: string;
}

export interface RecordedReply {
  duplicate: boolean;
  conversationId: string;
  messageId: string;
  label?: string;
}

async function findOrOpenConversation(db: Db, input: ReplyInput, now: string): Promise<string> {
  if (input.contactId) {
    const { data } = await db
      .from("sales_conversations")
      .select("id")
      .eq("session_id", input.sessionId)
      .eq("contact_id", input.contactId)
      .eq("channel", "email")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data.id as string;
  }
  const { data, error } = await db
    .from("sales_conversations")
    .insert({
      session_id: input.sessionId,
      account_id: input.accountId,
      contact_id: input.contactId,
      channel: "email",
      status: "open",
      last_message_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) throw new AppError("internal", `could not open conversation: ${error.message}`);
  return data.id as string;
}

/** Suppress the sender and close out the account after an unsubscribe. */
export async function applyUnsubscribe(
  db: Db,
  params: {
    sessionId: string;
    conversationId: string;
    identifier: string | null;
    accountId: string | null;
    source: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  if (params.identifier) {
    await addSuppression(db, {
      sessionId: params.sessionId,
      channel: "email",
      identifier: params.identifier,
      reason: "unsubscribe reply",
      source: params.source,
      actor: "system",
    });
  }
  if (params.accountId) {
    await db
      .from("sales_accounts")
      .update({ pipeline_stage: "suppressed", updated_at: now })
      .eq("id", params.accountId);
  }
  await db
    .from("sales_conversations")
    .update({ status: "suppressed", updated_at: now })
    .eq("id", params.conversationId);
}

export async function recordSalesReply(db: Db, input: ReplyInput): Promise<RecordedReply> {
  const now = input.receivedAt ?? new Date().toISOString();
  const content = input.content.trim();
  if (!content) throw new AppError("bad_request", "reply content is empty");

  const conversationId = await findOrOpenConversation(db, input, now);

  if (input.providerMessageId) {
    const { data: seen } = await db
      .from("sales_conversation_messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("provider_message_id", input.providerMessageId)
      .maybeSingle();
    if (seen) return { duplicate: true, conversationId, messageId: seen.id as string };
  }

  const { data: message, error: msgErr } = await db
    .from("sales_conversation_messages")
    .insert({
      conversation_id: conversationId,
      direction: "inbound",
      content: input.subject ? `Subject: ${input.subject}\n\n${content}` : content,
      provider_message_id: input.providerMessageId ?? null,
      sent_at: now,
    })
    .select("id")
    .single();
  if (msgErr) throw new AppError("internal", `could not store reply: ${msgErr.message}`);

  await db
    .from("sales_conversations")
    .update({ status: "needs_review", last_message_at: now, updated_at: now })
    .eq("id", conversationId);

  const { data: earlier } = await db
    .from("sales_conversation_messages")
    .select("direction, content")
    .eq("conversation_id", conversationId)
    .neq("id", message.id)
    .order("sent_at", { ascending: true })
    .limit(6);
  const classification = await triageReply(db, {
    sessionId: input.sessionId,
    content,
    previousMessages: (earlier ?? []).map(
      (m) => `${m.direction === "inbound" ? "Prospect" : "Founder"}: ${m.content}`,
    ),
  });
  const { data: cls, error: clsErr } = await db
    .from("sales_reply_classifications")
    .insert({
      session_id: input.sessionId,
      message_id: message.id,
      label: classification.label,
      confidence: classification.confidence,
      escalation_required: classification.escalation_required,
      draft_response: classification.draft_response ?? null,
    })
    .select("id")
    .single();
  if (clsErr) throw new AppError("internal", `could not classify reply: ${clsErr.message}`);

  await db
    .from("sales_conversation_messages")
    .update({ classification_id: cls.id })
    .eq("id", message.id);
  await db.from("sales_notifications").insert({
    session_id: input.sessionId,
    kind: classification.escalation_required ? "escalation" : "reply",
    title: `Inbound: ${classification.label.replace(/_/g, " ")}`,
    body: content.slice(0, 200),
    entity_type: "sales_conversation",
    entity_id: conversationId,
  });

  if (classification.label === "unsubscribe") {
    await applyUnsubscribe(db, {
      sessionId: input.sessionId,
      conversationId,
      identifier: input.fromEmail,
      accountId: input.accountId,
      source: "reply_unsubscribe",
    });
  }

  return {
    duplicate: false,
    conversationId,
    messageId: message.id as string,
    label: classification.label,
  };
}

interface ReceiptMatch {
  id: string;
  session_id: string;
  subject_id: string;
  replies: unknown[];
}

/**
 * Match an inbound email to the outbound receipt for the same thread and record
 * it as a sales reply. Returns null when the email is not a reply to Kami outreach.
 */
export async function ingestInboundEmail(
  db: Db,
  inbound: InboundEmail,
): Promise<RecordedReply | null> {
  if (!inbound.threadId) return null;
  const { data: receipt } = await db
    .from("outbound_receipts")
    .select("id, session_id, subject_id, replies")
    .eq("provider", inbound.provider)
    .eq("provider_thread_id", inbound.threadId)
    .eq("channel", "email")
    .eq("subject_type", "sales_touchpoint")
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!receipt) return null;
  const match = receipt as ReceiptMatch;

  const { data: tp } = await db
    .from("sales_touchpoints")
    .select("sales_sequence_enrollments(contact_id, account_id)")
    .eq("id", match.subject_id)
    .maybeSingle();
  const enrollment = (tp?.sales_sequence_enrollments ?? null) as {
    contact_id: string | null;
    account_id: string | null;
  } | null;

  const recorded = await recordSalesReply(db, {
    sessionId: match.session_id,
    contactId: enrollment?.contact_id ?? null,
    accountId: enrollment?.account_id ?? null,
    fromEmail: inbound.from,
    subject: inbound.subject,
    content: inbound.text,
    providerMessageId: inbound.messageId,
    receivedAt: inbound.receivedAt,
  });

  if (!recorded.duplicate) {
    await db
      .from("outbound_receipts")
      .update({
        replies: [
          ...(match.replies ?? []),
          { from: inbound.from, at: inbound.receivedAt, message_id: inbound.messageId },
        ],
      })
      .eq("id", match.id);
  }
  return recorded;
}
