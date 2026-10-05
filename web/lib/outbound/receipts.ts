import type { Db } from "@/lib/db/client";
import { AppError, conflict } from "@/lib/http/errors";

/**
 * Outbound receipts ledger. A send is claimed (status `sending`) under a unique
 * idempotency key *before* the provider call, then completed or failed. This makes
 * double clicks and retries safe and keeps "sent" tied to a provider id.
 */

export type OutboundChannel = "email" | "x_post" | "x_dm" | "ig_dm";
export type ReceiptSubject =
  "sales_touchpoint" | "sales_conversation" | "distribution_opportunity" | "marketing_crm";

export interface OutboundReceipt {
  id: string;
  session_id: string;
  channel: OutboundChannel;
  idempotency_key: string;
  status: "sending" | "sent" | "failed";
  subject_type: ReceiptSubject;
  subject_id: string;
  sales_campaign_id: string | null;
  provider: string;
  recipient: string | null;
  sent_as: string | null;
  content: string;
  provider_message_id: string | null;
  provider_thread_id: string | null;
  url: string | null;
  error: string | null;
  metrics: Record<string, number> | null;
  replies: unknown[];
  created_at: string;
  sent_at: string | null;
}

export interface ClaimInput {
  sessionId: string;
  channel: OutboundChannel;
  idempotencyKey: string;
  subjectType: ReceiptSubject;
  subjectId: string;
  salesCampaignId?: string | null;
  provider: string;
  recipient?: string | null;
  sentAs?: string | null;
  content: string;
}

/**
 * Whether a provider supports idempotent retries. When it does, a claim stuck in
 * `sending` (e.g. the process died mid-send) can be retried with the same key;
 * otherwise the outcome is unknown and retrying could deliver twice.
 */
export interface ClaimOptions {
  providerIsIdempotent: boolean;
}

const UNIQUE_VIOLATION = "23505";

export async function claimReceipt(
  db: Db,
  input: ClaimInput,
  opts: ClaimOptions,
): Promise<OutboundReceipt> {
  const row = {
    session_id: input.sessionId,
    channel: input.channel,
    idempotency_key: input.idempotencyKey,
    status: "sending",
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    sales_campaign_id: input.salesCampaignId ?? null,
    provider: input.provider,
    recipient: input.recipient ?? null,
    sent_as: input.sentAs ?? null,
    content: input.content,
  };
  const inserted = await db.from("outbound_receipts").insert(row).select("*").single();
  if (!inserted.error) return inserted.data as OutboundReceipt;
  if (inserted.error.code !== UNIQUE_VIOLATION)
    throw new AppError("internal", inserted.error.message);

  const { data: existing, error } = await db
    .from("outbound_receipts")
    .select("*")
    .eq("idempotency_key", input.idempotencyKey)
    .single();
  if (error) throw new AppError("internal", error.message);
  const receipt = existing as OutboundReceipt;

  if (receipt.status === "sent") {
    throw conflict("this was already sent", { receipt });
  }
  if (receipt.status === "sending" && !opts.providerIsIdempotent) {
    throw conflict(
      "a previous attempt did not finish and its outcome is unknown — check the account before retrying",
      { receipt },
    );
  }
  // Failed, or stuck with an idempotent provider: retry under the same key.
  const retried = await db
    .from("outbound_receipts")
    .update({ ...row, error: null })
    .eq("id", receipt.id)
    .select("*")
    .single();
  if (retried.error) throw new AppError("internal", retried.error.message);
  return retried.data as OutboundReceipt;
}

export async function completeReceipt(
  db: Db,
  id: string,
  result: {
    providerMessageId: string;
    providerThreadId?: string | null;
    url?: string | null;
    sentAs?: string | null;
  },
): Promise<OutboundReceipt> {
  const { data, error } = await db
    .from("outbound_receipts")
    .update({
      status: "sent",
      provider_message_id: result.providerMessageId,
      provider_thread_id: result.providerThreadId ?? null,
      url: result.url ?? null,
      ...(result.sentAs ? { sent_as: result.sentAs } : {}),
      sent_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    // The message went out; surface loudly so the founder does not resend.
    throw new AppError("internal", `sent, but recording the receipt failed: ${error.message}`, {
      sent: true,
      provider_message_id: result.providerMessageId,
    });
  }
  return data as OutboundReceipt;
}

export async function failReceipt(db: Db, id: string, message: string): Promise<void> {
  await db
    .from("outbound_receipts")
    .update({ status: "failed", error: message.slice(0, 1000) })
    .eq("id", id);
}

export async function listReceipts(
  db: Db,
  sessionId: string,
  opts: { channel?: OutboundChannel; limit?: number } = {},
): Promise<OutboundReceipt[]> {
  let query = db
    .from("outbound_receipts")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.channel) query = query.eq("channel", opts.channel);
  const { data, error } = await query;
  if (error) throw new AppError("internal", error.message);
  return (data ?? []) as OutboundReceipt[];
}
