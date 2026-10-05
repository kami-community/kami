import { emailConfigured, sendEmail } from "@/lib/agentmail";
import { assertCampaignNotPaused, assertSendAllowed } from "@/lib/salesPolicy";
import { draftFromTouchpoint, reviewEmailDraft } from "@/lib/salesReview";
import { supabaseServer } from "@/lib/supabase";

async function loadTouchpoint(
  sb: NonNullable<ReturnType<typeof supabaseServer>>,
  touchpointId: string,
) {
  const { data, error } = await sb
    .from("sales_touchpoints")
    .select(
      "*, sales_sequence_enrollments(id, session_id, sequence_id, contact_id, account_id, status, current_step, sales_sequences(sales_campaign_id), sales_contacts(name, email))",
    )
    .eq("id", touchpointId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ drafts: [] });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const status = url.searchParams.get("status");

  if (!sessionId) return Response.json({ drafts: [] });

  let query = sb
    .from("sales_touchpoints")
    .select(
      "*, sales_sequence_enrollments(id, status, contact_id, account_id, sales_contacts(name, email), sales_accounts(name, domain))",
    )
    .eq("session_id", sessionId)
    .eq("channel", "email")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  else query = query.in("status", ["drafted", "approved"]);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ drafts: data ?? [] });
}

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ persisted: false });

  const body = await request.json();
  const { action, touchpoint_id, session_id } = body as {
    action: "review" | "approve" | "send";
    touchpoint_id: string;
    session_id?: string;
  };

  if (!action || !touchpoint_id) {
    return Response.json({ error: "action and touchpoint_id required" }, { status: 400 });
  }

  let touchpoint: Awaited<ReturnType<typeof loadTouchpoint>>;
  try {
    touchpoint = await loadTouchpoint(sb, touchpoint_id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "load failed";
    return Response.json({ error: message }, { status: 500 });
  }

  if (!touchpoint) return Response.json({ error: "touchpoint not found" }, { status: 404 });

  const enrollment = touchpoint.sales_sequence_enrollments as Record<string, unknown>;
  const sessionId = (session_id ?? touchpoint.session_id) as string;

  if (action === "review") {
    const { data: campaign } = await sb
      .from("sales_campaigns")
      .select("approved_claims")
      .eq("session_id", sessionId)
      .maybeSingle();

    const input = draftFromTouchpoint(touchpoint);
    input.approved_claims = campaign?.approved_claims ?? [];

    const verdict = reviewEmailDraft(input);

    const { data, error } = await sb
      .from("sales_touchpoints")
      .update({ reviewer_verdict: verdict })
      .eq("id", touchpoint_id)
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    await sb.from("sales_audit_events").insert({
      session_id: sessionId,
      actor: "reviewer",
      action: "draft_reviewed",
      entity_type: "sales_touchpoint",
      entity_id: touchpoint_id,
      payload: { approved: verdict.approved, failed_criteria: verdict.failed_criteria },
    });

    return Response.json({ persisted: true, touchpoint: data, verdict });
  }

  if (action === "approve") {
    const verdict = touchpoint.reviewer_verdict as { approved?: boolean } | null;
    if (!verdict?.approved) {
      return Response.json(
        { error: "draft must pass review before approval — run review action first" },
        { status: 403 },
      );
    }

    const { data, error } = await sb
      .from("sales_touchpoints")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", touchpoint_id)
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    await sb.from("sales_audit_events").insert({
      session_id: sessionId,
      actor: "user",
      action: "draft_approved",
      entity_type: "sales_touchpoint",
      entity_id: touchpoint_id,
    });

    return Response.json({ persisted: true, touchpoint: data });
  }

  if (action === "send") {
    if (!emailConfigured()) {
      return Response.json({ error: "AgentMail not configured" }, { status: 503 });
    }

    if (touchpoint.status !== "approved" || !touchpoint.approved_at) {
      return Response.json({ error: "draft not approved" }, { status: 403 });
    }

    if (touchpoint.sent_at) {
      return Response.json({ error: "touchpoint already sent" }, { status: 409 });
    }

    const sequence = enrollment.sales_sequences as { sales_campaign_id?: string } | null;
    const campaignId = sequence?.sales_campaign_id;
    if (!campaignId) {
      return Response.json({ error: "campaign not linked to sequence" }, { status: 400 });
    }

    const pauseCheck = await assertCampaignNotPaused(sb, campaignId);
    if (!pauseCheck.ok) {
      return Response.json({ error: pauseCheck.error }, { status: pauseCheck.status });
    }

    const contact = enrollment.sales_contacts as { email?: string; name?: string } | null;
    const recipient = contact?.email?.trim();
    if (!recipient) {
      return Response.json({ error: "contact email required for send" }, { status: 400 });
    }

    const { count: priorSends } = await sb
      .from("sales_execution_receipts")
      .select("id", { count: "exact", head: true })
      .eq("sales_campaign_id", campaignId)
      .eq("status", "sent");

    const reviewerVerdict = touchpoint.reviewer_verdict as { approved?: boolean } | null;

    const sendCheck = await assertSendAllowed({
      sb,
      campaignId,
      recipient,
      channel: "email",
      draftApproved: touchpoint.status === "approved",
      reviewerApproved: Boolean(reviewerVerdict?.approved),
      isFirstSend: (priorSends ?? 0) === 0,
    });

    if (!sendCheck.ok) {
      return Response.json({ error: sendCheck.error }, { status: sendCheck.status });
    }

    const subject = String(touchpoint.draft_subject ?? "");
    const text = String(touchpoint.draft_body ?? "");
    if (!subject || !text) {
      return Response.json({ error: "draft subject and body required" }, { status: 400 });
    }

    try {
      const providerReceipt = await sendEmail({ to: recipient, subject, text });

      const { data: receipt, error: receiptErr } = await sb
        .from("sales_execution_receipts")
        .insert({
          session_id: sessionId,
          sales_campaign_id: campaignId,
          touchpoint_id,
          channel: "email",
          provider: "agentmail",
          provider_message_id: providerReceipt.message_id,
          recipient,
          status: "sent",
          raw: { provider: "agentmail", ...providerReceipt },
          sent_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (receiptErr) {
        return Response.json(
          { error: `send succeeded but receipt persist failed: ${receiptErr.message}` },
          { status: 500 },
        );
      }

      const step = Number(touchpoint.step);
      const enrollmentStatus =
        step === 1
          ? "sent_step_1"
          : step === 2
            ? "sent_step_2"
            : step >= 3
              ? "completed"
              : "eligible";

      await sb
        .from("sales_touchpoints")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_receipt_id: receipt.id,
        })
        .eq("id", touchpoint_id);

      await sb
        .from("sales_sequence_enrollments")
        .update({
          status: enrollmentStatus,
          current_step: step,
          updated_at: new Date().toISOString(),
        })
        .eq("id", enrollment.id);

      if (enrollment.account_id) {
        await sb
          .from("sales_accounts")
          .update({ pipeline_stage: "sent", updated_at: new Date().toISOString() })
          .eq("id", enrollment.account_id);
      }

      await sb.from("sales_audit_events").insert({
        session_id: sessionId,
        actor: "system",
        action: "email_sent",
        entity_type: "sales_touchpoint",
        entity_id: touchpoint_id,
        payload: {
          recipient,
          provider_message_id: providerReceipt.message_id,
          receipt_id: receipt.id,
        },
      });

      return Response.json({
        sent: true,
        receipt,
        provider_receipt: providerReceipt,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "send failed";
      await sb.from("sales_audit_events").insert({
        session_id: sessionId,
        actor: "system",
        action: "email_send_failed",
        entity_type: "sales_touchpoint",
        entity_id: touchpoint_id,
        payload: { error: message, recipient },
      });
      return Response.json({ error: message }, { status: 502 });
    }
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
