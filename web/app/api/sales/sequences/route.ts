import { supabaseServer } from "@/lib/supabase";
import { buildEmailSequence, SEQUENCE_STEPS } from "@/lib/salesSequences";
import type { AccountSignal, SalesAccount } from "@/lib/salesTypes";

/** Buyer-reachable only — role/non-buyer/safe_to_send aliases are not sequence-eligible. */
const VALID_EMAIL_VERIFICATION = new Set(["valid"]);

export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ sequences: [], enrollments: [] });

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return Response.json({ sequences: [], enrollments: [] });

  const { data: sequences } = await sb
    .from("sales_sequences")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  const { data: enrollments } = await sb
    .from("sales_sequence_enrollments")
    .select("*, sales_contacts(name, email), sales_accounts(name, domain)")
    .eq("session_id", sessionId)
    .order("enrolled_at", { ascending: false });

  return Response.json({
    sequences: sequences ?? [],
    enrollments: enrollments ?? [],
  });
}

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ persisted: false });

  const body = await request.json();
  const { session_id, account_ids, name } = body as {
    session_id: string;
    account_ids?: string[];
    name?: string;
  };

  if (!session_id) {
    return Response.json({ error: "session_id required" }, { status: 400 });
  }

  const { data: campaign, error: campErr } = await sb
    .from("sales_campaigns")
    .select("*")
    .eq("session_id", session_id)
    .maybeSingle();

  if (campErr) return Response.json({ error: campErr.message }, { status: 500 });
  if (!campaign) {
    return Response.json(
      { error: "sales campaign not configured — run setup first" },
      { status: 400 },
    );
  }

  let accountQuery = sb.from("sales_accounts").select("*").eq("session_id", session_id);
  if (account_ids?.length) {
    accountQuery = accountQuery.in("id", account_ids);
  } else {
    accountQuery = accountQuery.eq("pipeline_stage", "ready_for_approval");
  }

  const { data: accounts, error: accErr } = await accountQuery;
  if (accErr) return Response.json({ error: accErr.message }, { status: 500 });
  if (!accounts?.length) {
    return Response.json(
      { error: "no eligible accounts — provide account_ids or mark accounts ready_for_approval" },
      { status: 400 },
    );
  }

  const sequenceName = name ?? `Email sequence — ${new Date().toISOString().slice(0, 10)}`;
  const { data: sequence, error: seqErr } = await sb
    .from("sales_sequences")
    .insert({
      session_id,
      sales_campaign_id: campaign.id,
      name: sequenceName,
      channel: "email",
      steps: SEQUENCE_STEPS.map((s) => ({ step: s.step, delay_days: s.delay_days })),
      status: "draft",
    })
    .select("*")
    .single();

  if (seqErr) return Response.json({ error: seqErr.message }, { status: 500 });

  const { data: sessionRow } = await sb
    .from("agent_sessions")
    .select("goals_list")
    .eq("id", session_id)
    .maybeSingle();
  const goalsList = Array.isArray(sessionRow?.goals_list)
    ? (sessionRow!.goals_list as string[])
    : [];
  const goal = goalsList[0] ?? "";

  const enrolled: string[] = [];
  const skipped: { account_id: string; reason: string }[] = [];

  for (const account of accounts as SalesAccount[]) {
    const { data: contacts } = await sb
      .from("sales_contacts")
      .select("*")
      .eq("account_id", account.id)
      .eq("session_id", session_id)
      .not("email", "is", null);

    const contact = (contacts ?? []).find(
      (c) =>
        !c.do_not_contact &&
        (!c.email_verification || VALID_EMAIL_VERIFICATION.has(c.email_verification)),
    );

    if (!contact?.email) {
      skipped.push({ account_id: account.id!, reason: "no verified contact email" });
      continue;
    }

    const { data: signals } = await sb
      .from("sales_account_signals")
      .select("*")
      .eq("account_id", account.id)
      .order("captured_at", { ascending: false });

    const drafts = buildEmailSequence({
      offer: campaign.offer,
      claims: campaign.approved_claims ?? [],
      account: {
        name: contact.name ?? account.name,
        industry: account.industry,
        domain: account.domain,
      },
      signals: (signals ?? []) as AccountSignal[],
      goal,
    });

    const { data: enrollment, error: enrErr } = await sb
      .from("sales_sequence_enrollments")
      .insert({
        session_id,
        sequence_id: sequence.id,
        contact_id: contact.id,
        account_id: account.id,
        status: "awaiting_approval",
        current_step: 0,
      })
      .select("*")
      .single();

    if (enrErr) {
      skipped.push({ account_id: account.id!, reason: enrErr.message });
      continue;
    }

    const touchpointRows = drafts.map((draft) => ({
      session_id,
      enrollment_id: enrollment.id,
      channel: "email",
      step: draft.sequence_step,
      status: "drafted",
      draft_subject: draft.subject,
      draft_body: draft.body,
      draft_cta: draft.cta,
      draft_metadata: {
        evidence_refs: draft.evidence_refs,
        signal_ref: draft.signal_ref ?? null,
      },
    }));

    const { error: tpErr } = await sb.from("sales_touchpoints").insert(touchpointRows);
    if (tpErr) {
      skipped.push({ account_id: account.id!, reason: tpErr.message });
      continue;
    }

    await sb
      .from("sales_accounts")
      .update({ pipeline_stage: "sequencing", updated_at: new Date().toISOString() })
      .eq("id", account.id);

    enrolled.push(enrollment.id);
  }

  await sb.from("sales_audit_events").insert({
    session_id,
    actor: "system",
    action: "sequence_created",
    entity_type: "sales_sequence",
    entity_id: sequence.id,
    payload: { enrolled: enrolled.length, skipped },
  });

  return Response.json({
    persisted: true,
    sequence,
    enrolled_count: enrolled.length,
    skipped,
  });
}
