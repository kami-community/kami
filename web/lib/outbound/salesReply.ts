import type { Db } from "@/lib/db/client";
import { AppError, badRequest, notFound } from "@/lib/http/errors";
import type { EmailProvider } from "@/lib/ports/email";
import { assertNotPaused, assertNotSuppressed } from "./policy";
import { claimReceipt, completeReceipt, failReceipt, type OutboundReceipt } from "./receipts";

/**
 * Reply by email inside an existing sales conversation, threaded onto the
 * prospect's latest message. `clientMessageId` is generated once per composed
 * message by the UI so a retry never sends twice.
 */
export async function sendSalesConversationReply(
  db: Db,
  email: EmailProvider,
  params: { sessionId: string; conversationId: string; content: string; clientMessageId: string },
): Promise<OutboundReceipt> {
  const content = params.content.trim();
  if (!content) throw badRequest("message is empty");

  const { data: conversation, error } = await db
    .from("sales_conversations")
    .select("id, channel, contact_id, sales_contacts(email)")
    .eq("id", params.conversationId)
    .eq("session_id", params.sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!conversation) throw notFound("conversation not found for this campaign");
  if (conversation.channel !== "email")
    throw badRequest("only email conversations can be answered from Kami");

  const recipient = ((conversation.sales_contacts as { email?: string | null } | null)?.email ?? "")
    .trim()
    .toLowerCase();
  if (!recipient) throw badRequest("this contact has no email address");

  const { data: lastInbound } = await db
    .from("sales_conversation_messages")
    .select("provider_message_id")
    .eq("conversation_id", conversation.id)
    .eq("direction", "inbound")
    .not("provider_message_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastInbound?.provider_message_id) {
    throw badRequest("there is no email from this contact to reply to yet");
  }

  await assertNotPaused(db, params.sessionId, "sales");
  await assertNotSuppressed(db, { sessionId: params.sessionId, channel: "email", recipient });

  const idempotencyKey = `sales_conversation:${conversation.id}:${params.clientMessageId}`;
  const claim = await claimReceipt(
    db,
    {
      sessionId: params.sessionId,
      channel: "email",
      idempotencyKey,
      subjectType: "sales_conversation",
      subjectId: conversation.id,
      provider: email.id,
      recipient,
      sentAs: email.from,
      content,
    },
    { providerIsIdempotent: true },
  );

  let receipt: OutboundReceipt;
  try {
    const sent = await email.reply(
      { inReplyToMessageId: lastInbound.provider_message_id, text: content },
      { idempotencyKey },
    );
    receipt = await completeReceipt(db, claim.id, {
      providerMessageId: sent.messageId,
      providerThreadId: sent.threadId,
    });
  } catch (err) {
    if (!(err instanceof AppError && err.details?.sent)) {
      await failReceipt(db, claim.id, err instanceof Error ? err.message : "reply failed");
    }
    throw err;
  }

  const now = new Date().toISOString();
  await db.from("sales_conversation_messages").insert({
    conversation_id: conversation.id,
    direction: "outbound",
    content,
    provider_message_id: receipt.provider_message_id,
    sent_at: now,
  });
  await db
    .from("sales_conversations")
    .update({ status: "awaiting_reply", last_message_at: now, updated_at: now })
    .eq("id", conversation.id);

  return receipt;
}
