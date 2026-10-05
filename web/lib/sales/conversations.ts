import type { Db } from "@/lib/db/client";
import { AppError, notFound } from "@/lib/http/errors";
import { applyUnsubscribe } from "@/lib/inbound/salesReplies";
import { classifyReplyContent } from "@/lib/salesClassify";
import type { ReplyClassificationLabel, SalesConversation, SalesMessage } from "@/lib/salesTypes";

/** Sales conversations: inbox listing, thread view, manual classification and escalation. */

export async function listConversations(db: Db, sessionId: string): Promise<SalesConversation[]> {
  const { data, error } = await db
    .from("sales_conversations")
    .select(
      "id, session_id, account_id, contact_id, channel, status, last_message_at, created_at, updated_at",
    )
    .eq("session_id", sessionId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new AppError("internal", error.message);
  return (data ?? []) as SalesConversation[];
}

async function loadConversation(db: Db, sessionId: string, conversationId: string) {
  const { data, error } = await db
    .from("sales_conversations")
    .select("*, sales_contacts(email)")
    .eq("id", conversationId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("conversation not found for this campaign");
  return data;
}

export async function getThread(db: Db, sessionId: string, conversationId: string) {
  const conversation = await loadConversation(db, sessionId, conversationId);
  const { data: messages, error } = await db
    .from("sales_conversation_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });
  if (error) throw new AppError("internal", error.message);

  const messageIds = (messages ?? []).map((m) => m.id as string);
  const { data: classifications } = messageIds.length
    ? await db.from("sales_reply_classifications").select("*").in("message_id", messageIds)
    : { data: [] };
  const byMessage = new Map((classifications ?? []).map((c) => [c.message_id as string, c]));

  return {
    conversation,
    messages: (messages ?? []).map((m) => ({
      ...(m as SalesMessage),
      classification: byMessage.get(m.id as string) ?? null,
    })),
  };
}

/** Founder-confirmed (or re-run automatic) classification of an inbound message. */
export async function classifyMessage(
  db: Db,
  params: {
    sessionId: string;
    conversationId: string;
    messageId: string;
    label?: ReplyClassificationLabel;
  },
) {
  const conversation = await loadConversation(db, params.sessionId, params.conversationId);
  const { data: message } = await db
    .from("sales_conversation_messages")
    .select("id, content")
    .eq("id", params.messageId)
    .eq("conversation_id", conversation.id)
    .maybeSingle();
  if (!message) throw notFound("message not found in this conversation");

  const auto = classifyReplyContent(message.content);
  const label = params.label ?? auto.label;
  const manual = Boolean(params.label);
  const escalation = manual
    ? label === "unsubscribe" || label === "negative"
    : auto.escalation_required;

  const { data: classification, error } = await db
    .from("sales_reply_classifications")
    .insert({
      session_id: params.sessionId,
      message_id: message.id,
      label,
      confidence: manual ? 1 : auto.confidence,
      escalation_required: escalation,
      draft_response: manual ? null : (auto.draft_response ?? null),
    })
    .select("*")
    .single();
  if (error) throw new AppError("internal", error.message);

  await db
    .from("sales_conversation_messages")
    .update({ classification_id: classification.id })
    .eq("id", message.id);

  const contactEmail =
    (conversation.sales_contacts as { email?: string | null } | null)?.email ?? null;
  if (label === "unsubscribe") {
    await applyUnsubscribe(db, {
      sessionId: params.sessionId,
      conversationId: conversation.id,
      identifier: contactEmail,
      accountId: conversation.account_id,
      source: "reply_unsubscribe",
    });
  } else if (label === "positive" && conversation.account_id) {
    await db
      .from("sales_accounts")
      .update({ pipeline_stage: "engaged", updated_at: new Date().toISOString() })
      .eq("id", conversation.account_id)
      .eq("pipeline_stage", "sent");
  }
  return classification;
}

export async function escalateConversation(
  db: Db,
  params: { sessionId: string; conversationId: string; reason: string },
): Promise<void> {
  const conversation = await loadConversation(db, params.sessionId, params.conversationId);
  await db.from("sales_notifications").insert({
    session_id: params.sessionId,
    kind: "escalation",
    title: "Escalated conversation",
    body: params.reason,
    entity_type: "sales_conversation",
    entity_id: conversation.id,
  });
  await db
    .from("sales_conversations")
    .update({ status: "escalated", updated_at: new Date().toISOString() })
    .eq("id", conversation.id);
}
