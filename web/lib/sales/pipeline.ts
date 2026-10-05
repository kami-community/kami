import type { Db } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import type { PipelineStage, SalesAccount } from "@/lib/salesTypes";

/** Sales pipeline board: the campaign's accounts grouped by stage, with their latest score. */

export const PIPELINE_STAGES: PipelineStage[] = [
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

export type PipelineAccount = SalesAccount & { score?: number; score_explanation?: string };

export interface PipelineView {
  pipeline: Record<PipelineStage, PipelineAccount[]>;
  total: number;
}

export interface ScoreRow {
  account_id: string;
  factors: Record<string, number> | null;
  explanation: string | null;
  created_at: string;
}

function rowToAccount(row: Record<string, unknown>): SalesAccount {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    sales_campaign_id: (row.sales_campaign_id as string | null) ?? undefined,
    client_id: (row.client_id as string | null) ?? undefined,
    name: row.name as string,
    domain: (row.domain as string | null) ?? undefined,
    industry: (row.industry as string | null) ?? undefined,
    size: (row.size as string | null) ?? undefined,
    geo: (row.geo as string | null) ?? undefined,
    pipeline_stage: row.pipeline_stage as PipelineStage,
    tier: (row.tier as SalesAccount["tier"] | null) ?? undefined,
    segment_key: (row.segment_key as string | null) ?? undefined,
    notes: (row.notes as string | null) ?? undefined,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

/**
 * Group accounts by stage (preserving input order) and attach each account's
 * most recent score. Accounts in an unknown stage are dropped; `total` counts
 * only accounts on the board.
 */
export function buildPipeline(accounts: SalesAccount[], scores: ScoreRow[]): PipelineView {
  const latest = new Map<string, ScoreRow>();
  for (const s of scores) {
    const current = latest.get(s.account_id);
    if (!current || s.created_at > current.created_at) latest.set(s.account_id, s);
  }

  const pipeline = {} as Record<PipelineStage, PipelineAccount[]>;
  for (const stage of PIPELINE_STAGES) pipeline[stage] = [];
  let total = 0;
  for (const account of accounts) {
    const column = pipeline[account.pipeline_stage];
    if (!column) continue;
    const score = account.id ? latest.get(account.id) : undefined;
    column.push({
      ...account,
      score: score?.factors?.priority ?? score?.factors?.fit,
      score_explanation: score?.explanation ?? undefined,
    });
    total++;
  }
  return { pipeline, total };
}

export async function getPipeline(db: Db, sessionId: string): Promise<PipelineView> {
  const { data: accounts, error } = await db
    .from("sales_accounts")
    .select("*")
    .eq("session_id", sessionId)
    .order("updated_at", { ascending: false });
  if (error) throw new AppError("internal", error.message);

  const rows = (accounts ?? []).map(rowToAccount);
  if (rows.length === 0) return buildPipeline([], []);

  const { data: scores, error: scoreErr } = await db
    .from("sales_lead_scores")
    .select("account_id, factors, explanation, created_at")
    .eq("session_id", sessionId)
    .in(
      "account_id",
      rows.map((a) => a.id),
    );
  if (scoreErr) throw new AppError("internal", scoreErr.message);

  return buildPipeline(rows, (scores ?? []) as ScoreRow[]);
}
