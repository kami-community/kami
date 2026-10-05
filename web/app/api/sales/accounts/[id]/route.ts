import { supabaseServer } from "@/lib/supabase";
import { PIPELINE_TRANSITIONS, type PipelineStage, type SalesAccount } from "@/lib/salesTypes";

function rowToAccount(row: Record<string, unknown>): SalesAccount {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    sales_campaign_id: row.sales_campaign_id as string | undefined,
    client_id: row.client_id as string | undefined,
    name: row.name as string,
    domain: row.domain as string | undefined,
    industry: row.industry as string | undefined,
    size: row.size as string | undefined,
    geo: row.geo as string | undefined,
    pipeline_stage: row.pipeline_stage as PipelineStage,
    tier: row.tier as SalesAccount["tier"],
    notes: row.notes as string | undefined,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

function validateStageTransition(from: PipelineStage, to: PipelineStage): string | null {
  if (from === to) return null;
  const allowed = PIPELINE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return `invalid pipeline transition: ${from} → ${to}`;
  }
  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ account: null });

  const { id } = await context.params;

  const { data: account } = await sb.from("sales_accounts").select("*").eq("id", id).maybeSingle();
  if (!account) return Response.json({ account: null }, { status: 404 });

  const { data: signals } = await sb
    .from("sales_account_signals")
    .select("*")
    .eq("account_id", id)
    .order("captured_at", { ascending: false });

  const { data: contacts } = await sb.from("sales_contacts").select("*").eq("account_id", id);

  const { data: scores } = await sb
    .from("sales_lead_scores")
    .select("*")
    .eq("account_id", id)
    .order("created_at", { ascending: false })
    .limit(1);

  return Response.json({
    account: rowToAccount(account),
    signals: signals ?? [],
    contacts: contacts ?? [],
    lead_score: scores?.[0] ?? null,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ persisted: false });

  const { id } = await context.params;
  const body = await request.json();

  const { data: existing } = await sb.from("sales_accounts").select("*").eq("id", id).maybeSingle();
  if (!existing) return Response.json({ error: "account not found" }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.pipeline_stage) {
    const err = validateStageTransition(
      existing.pipeline_stage as PipelineStage,
      body.pipeline_stage as PipelineStage,
    );
    if (err) return Response.json({ error: err }, { status: 400 });
    updates.pipeline_stage = body.pipeline_stage;
  }

  if (body.tier !== undefined) updates.tier = body.tier;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.industry !== undefined) updates.industry = body.industry;

  const { data, error } = await sb
    .from("sales_accounts")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (body.pipeline_stage && body.pipeline_stage !== existing.pipeline_stage) {
    await sb.from("sales_audit_events").insert({
      session_id: existing.session_id,
      actor: body.actor ?? "user",
      action: "pipeline_stage_change",
      entity_type: "sales_account",
      entity_id: id,
      payload: { from: existing.pipeline_stage, to: body.pipeline_stage },
    });
  }

  return Response.json({ persisted: true, account: rowToAccount(data) });
}
