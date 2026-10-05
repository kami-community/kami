import { logAgentRunAsync } from "@/lib/agentRunLog";
import { assertDossierConfirmed, getCampaign } from "@/lib/campaigns/sessions";
import type { Db } from "@/lib/db/client";
import { recommendDistributionPlan, researchViaManager } from "@/lib/distributionManager";
import {
  normalizeSurfaces,
  type DistributionActionStatus,
  type DistributionApprovalStatus,
  type DistributionCampaignConfig,
  type DistributionOpportunity,
  type DistributionOutcome,
  type DistributionPlatform,
  type DistributionPlanStatus,
} from "@/lib/distributionTypes";
import { AppError, badRequest, notFound } from "@/lib/http/errors";
import { assertNotPaused } from "@/lib/outbound/policy";

/**
 * Create distribution: the Distribution manager recommends a plan from the
 * dossier, the founder edits/approves it, then the manager researches
 * opportunities per approved surface. Publishing lives in lib/outbound.
 */

const MAX_SURFACES = 3;

function toPlan(row: Record<string, unknown>): DistributionCampaignConfig {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    goal: (row.goal as string) ?? "early_users",
    goal_label: (row.goal_label as string) ?? undefined,
    angle: (row.angle as string) ?? undefined,
    surfaces: normalizeSurfaces(row.surfaces),
    rationale: (row.rationale as string) ?? undefined,
    why_these_surfaces: (row.why_these_surfaces as string) ?? undefined,
    status: (row.status as DistributionPlanStatus) ?? "proposed",
    revise_note: (row.revise_note as string) ?? undefined,
    source: row.source === "hermes" || row.source === "fallback" ? row.source : undefined,
    hermes_session_id: (row.hermes_session_id as string) ?? null,
    autonomous_paused: Boolean(row.autonomous_paused),
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

function toOpportunity(row: Record<string, unknown>): DistributionOpportunity {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    campaign_id: (row.campaign_id as string) ?? null,
    platform: row.platform as DistributionPlatform,
    source_url: row.source_url as string,
    evidence: (row.evidence as string) ?? null,
    why_now: row.why_now as string,
    suggested_action: row.suggested_action as string,
    draft: row.draft as string,
    risks: (row.risks as string) ?? null,
    format_used: (row.format_used as string) ?? null,
    format_why: (row.format_why as string) ?? null,
    approval_status: row.approval_status as DistributionApprovalStatus,
    action_status: row.action_status as DistributionActionStatus,
    outcome: row.outcome as DistributionOutcome,
    published_url: (row.published_url as string) ?? null,
    agent_skill: (row.agent_skill as string) ?? null,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

async function loadPlanRow(db: Db, sessionId: string) {
  const { data, error } = await db
    .from("distribution_campaigns")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  return data as Record<string, unknown> | null;
}

export async function getPlan(
  db: Db,
  sessionId: string,
): Promise<DistributionCampaignConfig | null> {
  const row = await loadPlanRow(db, sessionId);
  return row ? toPlan(row) : null;
}

/** Ask the Distribution manager for a plan (or a revision from the founder's note). */
export async function recommendPlan(db: Db, sessionId: string, reviseNote?: string) {
  await assertDossierConfirmed(db, sessionId);
  const { session, dossier } = await getCampaign(db, sessionId);
  const result = await recommendDistributionPlan({
    sessionId,
    domain: session.canonical_domain,
    dossier,
    reviseNote,
  });

  const { data, error } = await db
    .from("distribution_campaigns")
    .upsert(
      {
        session_id: sessionId,
        goal: result.plan.goal,
        goal_label: result.plan.goal_label ?? null,
        angle: result.plan.angle ?? null,
        surfaces: (result.plan.surfaces ?? []).slice(0, MAX_SURFACES),
        rationale: result.plan.rationale ?? null,
        why_these_surfaces: result.plan.why_these_surfaces ?? null,
        status: "proposed",
        revise_note: reviseNote ?? null,
        source: result.source,
        hermes_session_id: result.plan.hermes_session_id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" },
    )
    .select("*")
    .single();
  if (error) throw new AppError("internal", error.message);
  return { config: toPlan(data), source: result.source, note: result.note ?? null };
}

export interface PlanEdits {
  goal?: string;
  goal_label?: string;
  angle?: string;
  surfaces?: DistributionPlatform[];
  rationale?: string;
  why_these_surfaces?: string;
  status?: DistributionPlanStatus;
  autonomous_paused?: boolean;
}

/** Save founder edits; `approve` also unlocks research. */
export async function updatePlan(
  db: Db,
  sessionId: string,
  edits: PlanEdits,
  opts: { approve?: boolean } = {},
) {
  if (!(await loadPlanRow(db, sessionId))) throw badRequest("there is no distribution plan yet");
  const patch: Record<string, unknown> = { ...edits, updated_at: new Date().toISOString() };
  if (edits.surfaces) patch.surfaces = normalizeSurfaces(edits.surfaces).slice(0, MAX_SURFACES);
  if (opts.approve) patch.status = "approved";

  const { data, error } = await db
    .from("distribution_campaigns")
    .update(patch)
    .eq("session_id", sessionId)
    .select("*")
    .single();
  if (error) throw new AppError("internal", error.message);
  return toPlan(data);
}

export async function listOpportunities(
  db: Db,
  sessionId: string,
): Promise<DistributionOpportunity[]> {
  const { data, error } = await db
    .from("distribution_opportunities")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new AppError("internal", error.message);
  return (data ?? []).map(toOpportunity);
}

/** Research opportunities for the approved plan via the Distribution manager. */
export async function researchOpportunities(db: Db, sessionId: string) {
  const row = await loadPlanRow(db, sessionId);
  if (!row) throw badRequest("set up distribution first");
  await assertNotPaused(db, sessionId, "distribution");
  const plan = toPlan(row);
  if (plan.status !== "approved")
    throw badRequest("approve the distribution plan before finding opportunities");

  const { session, dossier } = await getCampaign(db, sessionId);
  const result = await researchViaManager({
    sessionId,
    plan,
    domain: session.canonical_domain,
    dossier,
  });

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("distribution_opportunities")
    .insert(
      result.opportunities.map((o) => ({
        session_id: sessionId,
        campaign_id: row.id,
        platform: o.platform,
        source_url: o.source_url,
        evidence: o.evidence,
        why_now: o.why_now,
        suggested_action: o.suggested_action,
        draft: o.draft,
        risks: o.risks,
        format_used: o.format_used ?? null,
        format_why: o.format_why ?? null,
        approval_status: o.approval_status,
        action_status: o.action_status,
        outcome: o.outcome,
        agent_skill: o.agent_skill,
        updated_at: now,
      })),
    )
    .select("*");
  if (error) throw new AppError("internal", error.message);

  const opportunities = (data ?? []).map(toOpportunity);
  logAgentRunAsync({
    sessionId,
    source: "pipeline",
    kind: "distribution_opportunities",
    agent: "distribution-manager",
    status: result.source === "hermes" ? "ok" : "fallback",
    outputJson: { source: result.source, note: result.note ?? null, count: opportunities.length },
    outputText: opportunities.map((o) => `${o.platform}: ${o.why_now}`).join("\n"),
  });
  return { opportunities, source: result.source, note: result.note ?? null };
}

export interface OpportunityEdits {
  approval_status?: DistributionApprovalStatus;
  /** "published" is reserved for Kami's own publish path. */
  action_status?: Exclude<DistributionActionStatus, "published">;
  outcome?: DistributionOutcome;
  published_url?: string;
  draft?: string;
  source_url?: string;
}

export async function updateOpportunity(
  db: Db,
  sessionId: string,
  id: string,
  edits: OpportunityEdits,
) {
  const { data, error } = await db
    .from("distribution_opportunities")
    .update({ ...edits, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("session_id", sessionId)
    .select("*")
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("opportunity not found for this campaign");
  return toOpportunity(data);
}
