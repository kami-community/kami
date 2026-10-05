import { supabaseServer } from "@/lib/supabase";
import type { LeadScoreFactors, PipelineStage, SalesAccount } from "@/lib/salesTypes";

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

export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ scores: [] });

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return Response.json({ scores: [] });

  const { data: scores, error } = await sb
    .from("sales_lead_scores")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const latestByAccount = new Map<string, Record<string, unknown>>();
  for (const row of scores ?? []) {
    const accountId = row.account_id as string | undefined;
    if (!accountId || latestByAccount.has(accountId)) continue;
    latestByAccount.set(accountId, row);
  }

  const accountIds = [...latestByAccount.keys()];
  let accountRows: Record<string, unknown>[] = [];
  if (accountIds.length) {
    const { data: accounts } = await sb.from("sales_accounts").select("*").in("id", accountIds);
    accountRows = accounts ?? [];
  }
  const accountById = new Map(accountRows.map((a) => [a.id as string, a]));

  const items = [...latestByAccount.values()].map((row) => {
    const accountRow = accountById.get(row.account_id as string) ?? null;
    return {
      id: row.id as string,
      account_id: row.account_id as string,
      model_version: row.model_version as string,
      factors: row.factors as LeadScoreFactors,
      explanation: row.explanation as string,
      evidence_refs: row.evidence_refs as string[] | undefined,
      recommended_tier: row.recommended_tier as number | undefined,
      recommended_channel: row.recommended_channel as string | undefined,
      created_at: row.created_at as string | undefined,
      account: accountRow ? rowToAccount(accountRow) : null,
    };
  });

  return Response.json({ scores: items });
}

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ persisted: false });

  const body = await request.json();
  const { account_id, included } = body as { account_id?: string; included?: boolean };

  if (!account_id || typeof included !== "boolean") {
    return Response.json({ error: "account_id and included (boolean) required" }, { status: 400 });
  }

  const { data: account, error: accErr } = await sb
    .from("sales_accounts")
    .select("*")
    .eq("id", account_id)
    .maybeSingle();

  if (accErr) return Response.json({ error: accErr.message }, { status: 500 });
  if (!account) return Response.json({ error: "account not found" }, { status: 404 });

  const nextStage: PipelineStage = included ? "ready_for_approval" : "researching";
  const inclusionNote = included ? "included_for_approval" : "excluded_from_cohort";

  const { data, error } = await sb
    .from("sales_accounts")
    .update({
      pipeline_stage: nextStage,
      notes: account.notes ? `${account.notes}; ${inclusionNote}` : inclusionNote,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account_id)
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  await sb.from("sales_audit_events").insert({
    session_id: account.session_id,
    actor: "user",
    action: included ? "target_included" : "target_excluded",
    entity_type: "sales_account",
    entity_id: account_id,
    payload: { included, pipeline_stage: nextStage },
  });

  return Response.json({
    persisted: true,
    account: rowToAccount(data),
    included,
  });
}
