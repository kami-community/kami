import type {
  PipelineStage,
  SalesAccount,
  SalesCampaignConfig,
  SalesChannel,
  SalesIcp,
  SalesPlan,
} from "@/lib/salesTypes";

/** Row → API shape mappers for the Sales tables. Pure; no database access. */

export type Row = Record<string, unknown>;

function icpFromRow(value: unknown): SalesIcp {
  if (!value || typeof value !== "object") return { titles: [], industries: [] };
  const o = value as Row;
  return {
    titles: Array.isArray(o.titles) ? o.titles.map(String) : [],
    industries: Array.isArray(o.industries) ? o.industries.map(String) : [],
    size: typeof o.size === "string" ? o.size : undefined,
    geo: typeof o.geo === "string" ? o.geo : undefined,
  };
}

export function rowToConfig(row: Row): SalesCampaignConfig {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    client_id: (row.client_id as string | null) ?? undefined,
    offer: row.offer as string,
    icp: icpFromRow(row.icp),
    geo: (row.geo as string | null) ?? undefined,
    exclusions: (row.exclusions as string[] | null) ?? undefined,
    deal_range: (row.deal_range as SalesCampaignConfig["deal_range"] | null) ?? undefined,
    approved_claims: (row.approved_claims as string[] | null) ?? undefined,
    target_quantity: (row.target_quantity as number | null) ?? undefined,
    sender_identity:
      (row.sender_identity as SalesCampaignConfig["sender_identity"] | null) ?? undefined,
    daily_send_cap: (row.daily_send_cap as number | null) ?? undefined,
    allowed_channels: (row.allowed_channels as SalesChannel[] | null) ?? undefined,
    autonomous_paused: Boolean(row.autonomous_paused),
    autonomy: {
      paused: Boolean(row.autonomous_paused),
      auto_followups: row.auto_followups !== false,
      require_first_send_approval: row.require_first_send_approval !== false,
    },
    pipeline_stage: row.pipeline_stage as SalesCampaignConfig["pipeline_stage"],
    segments: (row.segments as SalesCampaignConfig["segments"]) ?? null,
    segments_confirmed_at: (row.segments_confirmed_at as string | null) ?? null,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

/** The strategist prefixes scaffold plans with these markers (lib/salesStrategy.ts). */
const OFFLINE_PLAN = /^(\[Offline fallback|Sales plan needs research confirmation)/;

export function rowToPlan(row: Row): SalesPlan {
  const rationale = (row.channel_rationale as string | null) ?? "";
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    sales_campaign_id: (row.sales_campaign_id as string | null) ?? undefined,
    version: row.version as number,
    motions: (row.motions ?? []) as SalesPlan["motions"],
    tiers: (row.tiers ?? []) as SalesPlan["tiers"],
    channel_rationale: rationale,
    risks: (row.risks as string[] | null) ?? [],
    prerequisites: (row.prerequisites as string[] | null) ?? [],
    estimated_activity: row.estimated_activity as SalesPlan["estimated_activity"],
    approval_scope: (row.approval_scope ?? []) as SalesPlan["approval_scope"],
    status: row.status as SalesPlan["status"],
    revise_note: (row.revise_note as string | null) ?? undefined,
    source: OFFLINE_PLAN.test(rationale) ? "offline_fallback" : "hermes",
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

export function rowToAccount(row: Row): SalesAccount {
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
