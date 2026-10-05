import { sendDirectMessage as sendXDm } from "@/lib/adapters/x/api";
import { sendDirectMessage as sendIgDm } from "@/lib/adapters/instagram";
import { requireConnection } from "@/lib/connections/service";
import type { Db } from "@/lib/db/client";
import { AppError, badRequest, notFound } from "@/lib/http/errors";
import { assertNotPaused, assertNotSuppressed } from "./policy";
import { claimReceipt, completeReceipt, failReceipt, type OutboundReceipt } from "./receipts";

/**
 * Send the first outreach DM to a marketing CRM entry (X lead or Instagram
 * creator) from the session's connected account. Clicking send is the approval.
 */

interface CrmEntry {
  id: string;
  type: "x_lead" | "creator";
  platform: "x" | "instagram";
  handle: string;
  relevance_reasoning: string | null;
  offer_amount: number | null;
}

/** Plain opener used when the founder did not edit the message. */
export function defaultOpener(entry: Pick<CrmEntry, "handle" | "type" | "offer_amount">): string {
  const name = entry.handle.replace(/^@/, "");
  if (entry.type === "creator") {
    const offer = entry.offer_amount != null ? ` Budget is around $${entry.offer_amount}.` : "";
    return `Hi ${name} — I'm building something your audience may find useful. Open to a paid collab?${offer}`;
  }
  return `Hi ${name} — saw your recent posts and thought what we're building might help. Open to a quick look?`;
}

async function conversationFor(
  db: Db,
  entry: CrmEntry,
  goal: string,
  budget: { min: number | null; max: number | null },
) {
  const { data: existing } = await db
    .from("marketing_conversations")
    .select("id")
    .eq("crm_entry_id", entry.id)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from("marketing_conversations")
    .insert({
      crm_entry_id: entry.id,
      platform: entry.platform,
      goal,
      budget_min: budget.min,
      budget_max: budget.max,
      status: "first_msg_drafted",
    })
    .select("id")
    .single();
  if (error) throw new AppError("internal", `could not create conversation: ${error.message}`);
  return data.id as string;
}

/** Deliver one DM from the connected account; returns the provider message id. */
async function deliverDm(
  db: Db,
  params: { sessionId: string; entry: CrmEntry; text: string; idempotencyKey: string },
): Promise<{ receipt: OutboundReceipt; account: string }> {
  const { sessionId, entry, text } = params;
  await assertNotPaused(db, sessionId, "marketing");
  await assertNotSuppressed(db, { sessionId, channel: entry.platform, recipient: entry.handle });
  const account = await requireConnection(db, sessionId, entry.platform);

  const claim = await claimReceipt(
    db,
    {
      sessionId,
      channel: entry.platform === "x" ? "x_dm" : "ig_dm",
      idempotencyKey: params.idempotencyKey,
      subjectType: "marketing_crm",
      subjectId: entry.id,
      provider: entry.platform,
      recipient: `@${entry.handle.replace(/^@/, "")}`,
      sentAs: account.handle,
      content: text,
    },
    { providerIsIdempotent: false },
  );

  try {
    let providerMessageId: string;
    if (entry.platform === "x") {
      providerMessageId = (await sendXDm(account.accessToken, entry.handle, text)).eventId;
    } else {
      if (!account.externalUserId)
        throw badRequest("Instagram account id missing — reconnect Instagram");
      providerMessageId = (
        await sendIgDm({
          accessToken: account.accessToken,
          senderUserId: account.externalUserId,
          recipientHandle: entry.handle,
          text,
        })
      ).messageId;
    }
    const receipt = await completeReceipt(db, claim.id, { providerMessageId });
    return { receipt, account: account.handle };
  } catch (err) {
    if (!(err instanceof AppError && err.details?.sent)) {
      await failReceipt(db, claim.id, err instanceof Error ? err.message : "DM failed");
    }
    throw err;
  }
}

async function loadEntry(db: Db, sessionId: string, crmEntryId: string): Promise<CrmEntry> {
  const { data, error } = await db
    .from("marketing_crm")
    .select("id, type, platform, handle, relevance_reasoning, offer_amount")
    .eq("id", crmEntryId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("CRM entry not found for this campaign");
  const entry = data as CrmEntry;
  if (entry.platform !== "x" && entry.platform !== "instagram") {
    throw badRequest(`unsupported platform ${entry.platform}`);
  }
  return entry;
}

async function recordSent(
  db: Db,
  conversationId: string,
  text: string,
  receipt: OutboundReceipt,
  status: string,
) {
  const now = new Date().toISOString();
  await db.from("marketing_conversation_messages").insert({
    conversation_id: conversationId,
    sender: "kami",
    content: text,
    platform_message_id: receipt.provider_message_id,
    status: "sent",
  });
  await db
    .from("marketing_conversations")
    .update({ status, updated_at: now })
    .eq("id", conversationId);
}

export async function sendMarketingDm(
  db: Db,
  params: { sessionId: string; crmEntryId: string; text?: string; goal?: string },
): Promise<{ receipt: OutboundReceipt; conversationId: string; account: string }> {
  const entry = await loadEntry(db, params.sessionId, params.crmEntryId);
  const { data: config } = await db
    .from("marketing_config")
    .select("x_outreach_goal, ig_offer_min, ig_offer_max")
    .eq("session_id", params.sessionId)
    .maybeSingle();
  const goal =
    params.goal ??
    (entry.type === "creator"
      ? "negotiate_collab"
      : config?.x_outreach_goal === "book_demo"
        ? "book_demo"
        : "drive_signup");
  const text = params.text?.trim() || defaultOpener(entry);

  const conversationId = await conversationFor(db, entry, goal, {
    min: config?.ig_offer_min ?? null,
    max: config?.ig_offer_max ?? null,
  });

  let delivered: { receipt: OutboundReceipt; account: string };
  try {
    delivered = await deliverDm(db, {
      sessionId: params.sessionId,
      entry,
      text,
      idempotencyKey: `marketing_crm:${entry.id}:first_dm`,
    });
  } catch (err) {
    await db
      .from("marketing_conversations")
      .update({
        status: "escalated",
        escalation_reason: err instanceof Error ? err.message : "DM failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
    throw err;
  }

  await recordSent(db, conversationId, text, delivered.receipt, "first_msg_sent");
  await db
    .from("marketing_crm")
    .update({ status: "contacted", updated_at: new Date().toISOString() })
    .eq("id", entry.id);
  return { ...delivered, conversationId };
}

/** Send a follow-up DM in an existing marketing conversation. */
export async function sendConversationMessage(
  db: Db,
  params: { sessionId: string; conversationId: string; text: string; clientMessageId: string },
): Promise<{ receipt: OutboundReceipt; account: string }> {
  const text = params.text.trim();
  if (!text) throw badRequest("message is empty");
  const { data: conversation, error } = await db
    .from("marketing_conversations")
    .select("id, crm_entry_id, marketing_crm!inner(session_id)")
    .eq("id", params.conversationId)
    .eq("marketing_crm.session_id", params.sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!conversation) throw notFound("conversation not found for this campaign");

  const entry = await loadEntry(db, params.sessionId, conversation.crm_entry_id);
  const delivered = await deliverDm(db, {
    sessionId: params.sessionId,
    entry,
    text,
    idempotencyKey: `marketing_conversation:${conversation.id}:${params.clientMessageId}`,
  });
  await recordSent(db, conversation.id, text, delivered.receipt, "awaiting_reply");
  return delivered;
}
