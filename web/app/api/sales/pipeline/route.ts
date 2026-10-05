import { supabaseServer } from "@/lib/supabase";
import type { PipelineStage, SalesAccount } from "@/lib/salesTypes";

const STAGES: PipelineStage[] = [
  "researching",
  "ready_for_approval",
  "sequencing",
  "sent",
  "engaged",
  "qualified",
  "meeting_proposed",
  "invited",
  "accepted",
  "closed_won",
  "closed_lost",
  "invalid",
  "suppressed",
];

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
  if (!sb) return Response.json({ pipeline: {} });

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return Response.json({ pipeline: {} });

  const { data: accounts, error } = await sb
    .from("sales_accounts")
    .select("*")
    .eq("session_id", sessionId)
    .order("updated_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const accountIds = (accounts ?? []).map((a) => a.id);
  const scoresByAccount: Record<
    string,
    { factors?: Record<string, number>; explanation?: string }
  > = {};

  if (accountIds.length > 0) {
    const { data: scores } = await sb
      .from("sales_lead_scores")
      .select("account_id, factors, explanation, created_at")
      .in("account_id", accountIds)
      .order("created_at", { ascending: false });

    for (const s of scores ?? []) {
      const aid = s.account_id as string;
      if (!scoresByAccount[aid]) {
        scoresByAccount[aid] = {
          factors: s.factors as Record<string, number>,
          explanation: s.explanation as string,
        };
      }
    }
  }

  const pipeline: Record<
    string,
    (SalesAccount & { score?: number; score_explanation?: string })[]
  > = {};
  for (const stage of STAGES) pipeline[stage] = [];

  for (const row of accounts ?? []) {
    const account = rowToAccount(row);
    const scoreData = scoresByAccount[account.id!];
    const score = scoreData?.factors?.priority ?? scoreData?.factors?.fit;
    const stage = account.pipeline_stage;
    if (pipeline[stage]) {
      pipeline[stage].push({ ...account, score, score_explanation: scoreData?.explanation });
    }
  }

  return Response.json({ pipeline, total: accounts?.length ?? 0 });
}
