import { getCampaign } from "@/lib/campaigns/sessions";
import type { Db } from "@/lib/db/client";
import type { SalesSegment } from "@/lib/domain/segments";
import { badRequest, notFound } from "@/lib/http/errors";
import { generateSalesStrategy } from "@/lib/salesStrategy";
import type { SalesPlan, SalesPlanStatus } from "@/lib/salesTypes";
import { rowToConfig, rowToPlan, type Row } from "./rows";
import { audit, dbError, loadSalesCampaign, now } from "./shared";

/**
 * The outbound plan: drafted by the sales-strategist agent from the confirmed
 * segments, approved by the founder before discovery can run.
 */

export async function getLatestPlan(
  db: Db,
  sessionId: string,
  status?: SalesPlanStatus,
): Promise<SalesPlan | null> {
  let query = db.from("sales_plans").select("*").eq("session_id", sessionId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw dbError(error);
  return data ? rowToPlan(data as Row) : null;
}

export async function approvePlan(db: Db, sessionId: string, planId: string) {
  const { data: plan, error: loadError } = await db
    .from("sales_plans")
    .select("id, version, status")
    .eq("id", planId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (loadError) throw dbError(loadError);
  if (!plan) throw notFound("plan not found for this session");
  if (plan.status === "superseded")
    throw badRequest("this plan was superseded — approve the latest one");

  const { error: supersedeError } = await db
    .from("sales_plans")
    .update({ status: "superseded", updated_at: now() })
    .eq("session_id", sessionId)
    .eq("status", "approved")
    .neq("id", planId);
  if (supersedeError) throw dbError(supersedeError);

  const { data, error } = await db
    .from("sales_plans")
    .update({ status: "approved", updated_at: now() })
    .eq("id", planId)
    .eq("session_id", sessionId)
    .select("*")
    .single();
  if (error) throw dbError(error, "could not approve the plan");

  await audit(db, {
    sessionId,
    actor: "user",
    action: "plan_approved",
    entityType: "sales_plan",
    entityId: planId,
    payload: { version: data.version },
  });
  return { persisted: true as const, plan: rowToPlan(data as Row) };
}

async function nextPlanVersion(db: Db, campaignId: string): Promise<number> {
  const { data, error } = await db
    .from("sales_plans")
    .select("version")
    .eq("sales_campaign_id", campaignId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error);
  return ((data?.version as number | undefined) ?? 0) + 1;
}

/** Draft a new plan version (Hermes strategist, or the offline template with a note). */
export async function generatePlan(db: Db, sessionId: string, reviseNote?: string) {
  const campaign = await loadSalesCampaign(db, sessionId);
  const campaignId = campaign.id as string;
  const [version, { session, dossier }] = await Promise.all([
    nextPlanVersion(db, campaignId),
    getCampaign(db, sessionId),
  ]);

  const strategist = await generateSalesStrategy({
    domain: session.canonical_domain || session.domain,
    dossier,
    config: rowToConfig(campaign),
    campaignId,
    version,
    segments: Array.isArray(campaign.segments) ? (campaign.segments as SalesSegment[]) : null,
    goals: session.goals,
    kamiSessionId: sessionId,
  });
  const plan = strategist.plan;

  const { data, error } = await db
    .from("sales_plans")
    .insert({
      session_id: sessionId,
      sales_campaign_id: campaignId,
      version: plan.version ?? version,
      motions: plan.motions,
      tiers: plan.tiers,
      channel_rationale: plan.channel_rationale,
      risks: plan.risks,
      prerequisites: plan.prerequisites,
      estimated_activity: plan.estimated_activity,
      approval_scope: plan.approval_scope,
      status: "draft",
      revise_note: reviseNote || strategist.note || null,
      updated_at: now(),
    })
    .select("*")
    .single();
  if (error) throw dbError(error, "could not save the plan");

  return {
    persisted: true as const,
    plan: rowToPlan(data as Row),
    source: strategist.source,
    note: strategist.note ?? null,
  };
}
