import type { Db } from "@/lib/db/client";
import { AppError, forbidden, notFound } from "@/lib/http/errors";
import { draftFromTouchpoint, reviewEmailDraft } from "@/lib/salesReview";
import type { ReviewerVerdict } from "@/lib/salesTypes";

/** Email draft review queue: list → review (rubric) → founder approval. Sending lives in lib/outbound. */

export async function listDrafts(db: Db, sessionId: string, status?: string) {
  let query = db
    .from("sales_touchpoints")
    .select(
      "*, sales_sequence_enrollments(id, status, contact_id, account_id, sales_contacts(name, email), sales_accounts(name, domain))",
    )
    .eq("session_id", sessionId)
    .eq("channel", "email")
    .order("created_at", { ascending: false });
  query = status ? query.eq("status", status) : query.in("status", ["drafted", "approved"]);
  const { data, error } = await query;
  if (error) throw new AppError("internal", error.message);
  return data ?? [];
}

async function loadTouchpoint(db: Db, sessionId: string, touchpointId: string) {
  const { data, error } = await db
    .from("sales_touchpoints")
    .select("*")
    .eq("id", touchpointId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("touchpoint not found for this campaign");
  return data as Record<string, unknown>;
}

async function audit(
  db: Db,
  sessionId: string,
  actor: string,
  action: string,
  id: string,
  payload?: object,
) {
  await db.from("sales_audit_events").insert({
    session_id: sessionId,
    actor,
    action,
    entity_type: "sales_touchpoint",
    entity_id: id,
    payload: payload ?? null,
  });
}

export async function reviewTouchpoint(db: Db, sessionId: string, touchpointId: string) {
  const touchpoint = await loadTouchpoint(db, sessionId, touchpointId);
  const { data: campaign } = await db
    .from("sales_campaigns")
    .select("approved_claims")
    .eq("session_id", sessionId)
    .maybeSingle();

  const verdict: ReviewerVerdict = reviewEmailDraft({
    ...draftFromTouchpoint(touchpoint),
    approved_claims: campaign?.approved_claims ?? [],
  });

  const { data, error } = await db
    .from("sales_touchpoints")
    .update({ reviewer_verdict: verdict })
    .eq("id", touchpointId)
    .select("*")
    .single();
  if (error) throw new AppError("internal", error.message);

  await audit(db, sessionId, "reviewer", "draft_reviewed", touchpointId, {
    approved: verdict.approved,
    failed_criteria: verdict.failed_criteria,
  });
  return { touchpoint: data, verdict };
}

export async function approveTouchpoint(db: Db, sessionId: string, touchpointId: string) {
  const touchpoint = await loadTouchpoint(db, sessionId, touchpointId);
  const verdict = touchpoint.reviewer_verdict as ReviewerVerdict | null;
  if (!verdict?.approved) throw forbidden("the draft must pass review before you approve it");

  const { data, error } = await db
    .from("sales_touchpoints")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", touchpointId)
    .select("*")
    .single();
  if (error) throw new AppError("internal", error.message);

  await audit(db, sessionId, "user", "draft_approved", touchpointId);
  return { touchpoint: data };
}

/** Save the founder's edits. Any change needs a fresh review and approval. */
export async function editTouchpoint(
  db: Db,
  sessionId: string,
  touchpointId: string,
  edits: { subject: string; body: string },
) {
  const touchpoint = await loadTouchpoint(db, sessionId, touchpointId);
  if (touchpoint.status === "sent" || touchpoint.sent_at) {
    throw forbidden("this email was already sent and can't be edited");
  }
  const { data, error } = await db
    .from("sales_touchpoints")
    .update({
      draft_subject: edits.subject,
      draft_body: edits.body,
      reviewer_verdict: null,
      status: "drafted",
      approved_at: null,
    })
    .eq("id", touchpointId)
    .select("*")
    .single();
  if (error) throw new AppError("internal", error.message);

  await audit(db, sessionId, "user", "draft_edited", touchpointId);
  return { touchpoint: data };
}
