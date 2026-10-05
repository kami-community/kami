import type { Db } from "@/lib/db/client";
import { AppError, badRequest, conflict, forbidden, notFound } from "@/lib/http/errors";
import type { EmailProvider } from "@/lib/ports/email";
import {
  assertNotPaused,
  assertNotSuppressed,
  assertSalesSendAllowed,
  loadSalesCampaignPolicy,
} from "./policy";
import { claimReceipt, completeReceipt, failReceipt, type OutboundReceipt } from "./receipts";

/**
 * Send one approved sales email touchpoint. The recipient always comes from the
 * contact record (never free text), and the draft must have passed review and
 * been approved by the founder.
 */

interface TouchpointRow {
  id: string;
  session_id: string;
  step: number;
  status: string;
  approved_at: string | null;
  sent_at: string | null;
  draft_subject: string | null;
  draft_body: string | null;
  reviewer_verdict: { approved?: boolean } | null;
  sales_sequence_enrollments: {
    id: string;
    account_id: string | null;
    sales_sequences: { sales_campaign_id: string | null } | null;
    sales_contacts: { email: string | null; do_not_contact: boolean | null } | null;
  } | null;
}

function enrollmentStatusAfterStep(step: number): string {
  if (step === 1) return "sent_step_1";
  if (step === 2) return "sent_step_2";
  return step >= 3 ? "completed" : "eligible";
}

async function audit(
  db: Db,
  sessionId: string,
  action: string,
  touchpointId: string,
  payload: Record<string, unknown>,
) {
  await db.from("sales_audit_events").insert({
    session_id: sessionId,
    actor: "system",
    action,
    entity_type: "sales_touchpoint",
    entity_id: touchpointId,
    payload,
  });
}

export async function sendSalesTouchpoint(
  db: Db,
  email: EmailProvider,
  params: { sessionId: string; touchpointId: string },
): Promise<OutboundReceipt> {
  const { data, error } = await db
    .from("sales_touchpoints")
    .select(
      "id, session_id, step, status, approved_at, sent_at, draft_subject, draft_body, reviewer_verdict, sales_sequence_enrollments(id, account_id, sales_sequences(sales_campaign_id), sales_contacts(email, do_not_contact))",
    )
    .eq("id", params.touchpointId)
    .eq("session_id", params.sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("touchpoint not found for this campaign");
  const tp = data as unknown as TouchpointRow;

  if (tp.sent_at || tp.status === "sent") throw conflict("this email was already sent");
  if (tp.status !== "approved" || !tp.approved_at)
    throw forbidden("approve the draft before sending");
  if (!tp.reviewer_verdict?.approved) throw forbidden("the reviewer has not approved this draft");

  const enrollment = tp.sales_sequence_enrollments;
  const campaignId = enrollment?.sales_sequences?.sales_campaign_id;
  if (!enrollment || !campaignId) throw badRequest("touchpoint is not linked to a sales campaign");

  const recipient = enrollment.sales_contacts?.email?.trim().toLowerCase();
  if (!recipient) throw badRequest("this contact has no email address — Kami never invents one");
  if (enrollment.sales_contacts?.do_not_contact)
    throw forbidden(`${recipient} is marked do-not-contact`);

  const subject = tp.draft_subject?.trim() ?? "";
  const text = tp.draft_body?.trim() ?? "";
  if (!subject || !text) throw badRequest("the draft needs a subject and a body");

  await assertNotPaused(db, params.sessionId, "sales");
  await assertNotSuppressed(db, { sessionId: params.sessionId, channel: "email", recipient });
  const campaign = await loadSalesCampaignPolicy(db, campaignId);
  await assertSalesSendAllowed(db, campaign, "email");

  const idempotencyKey = `sales_touchpoint:${tp.id}`;
  const claim = await claimReceipt(
    db,
    {
      sessionId: params.sessionId,
      channel: "email",
      idempotencyKey,
      subjectType: "sales_touchpoint",
      subjectId: tp.id,
      salesCampaignId: campaignId,
      provider: email.id,
      recipient,
      sentAs: email.from,
      content: `Subject: ${subject}\n\n${text}`,
    },
    { providerIsIdempotent: true },
  );

  let receipt: OutboundReceipt;
  try {
    const sent = await email.send({ to: recipient, subject, text }, { idempotencyKey });
    receipt = await completeReceipt(db, claim.id, {
      providerMessageId: sent.messageId,
      providerThreadId: sent.threadId,
    });
  } catch (err) {
    if (!(err instanceof AppError && err.details?.sent)) {
      const message = err instanceof Error ? err.message : "send failed";
      await failReceipt(db, claim.id, message);
      await audit(db, params.sessionId, "email_send_failed", tp.id, { recipient, error: message });
    }
    throw err;
  }

  const now = new Date().toISOString();
  await db
    .from("sales_touchpoints")
    .update({ status: "sent", sent_at: now, provider_receipt_id: receipt.id })
    .eq("id", tp.id);
  await db
    .from("sales_sequence_enrollments")
    .update({ status: enrollmentStatusAfterStep(tp.step), current_step: tp.step, updated_at: now })
    .eq("id", enrollment.id);
  if (enrollment.account_id) {
    await db
      .from("sales_accounts")
      .update({ pipeline_stage: "sent", updated_at: now })
      .eq("id", enrollment.account_id);
  }
  await audit(db, params.sessionId, "email_sent", tp.id, {
    recipient,
    provider_message_id: receipt.provider_message_id,
    receipt_id: receipt.id,
  });

  return receipt;
}
