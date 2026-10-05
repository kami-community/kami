import { logAgentRunAsync } from "@/lib/agentRunLog";
import { dossierFromBrandPayload } from "@/lib/guideContext";
import { researchDistributionOpportunities } from "@/lib/distributionResearch";
import type {
  DistributionActionStatus,
  DistributionApprovalStatus,
  DistributionOpportunity,
  DistributionOutcome,
  DistributionPlatform,
} from "@/lib/distributionTypes";
import { supabaseServer } from "@/lib/supabase";

function mapDbError(message: string | undefined): string {
  const m = message ?? "database error";
  if (
    /distribution_campaigns|distribution_opportunities/i.test(m) &&
    /(schema cache|does not exist|Could not find the table)/i.test(m)
  ) {
    return "Distribution tables missing. Apply Supabase migration 009_distribution_opportunities.sql, then retry.";
  }
  return m;
}

function rowToOpp(row: Record<string, unknown>): DistributionOpportunity {
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
    approval_status: row.approval_status as DistributionApprovalStatus,
    action_status: row.action_status as DistributionActionStatus,
    outcome: row.outcome as DistributionOutcome,
    published_url: (row.published_url as string) ?? null,
    agent_skill: (row.agent_skill as string) ?? null,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ opportunities: [] });
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return Response.json({ error: "session_id required" }, { status: 400 });

  const { data, error } = await sb
    .from("distribution_opportunities")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) return Response.json({ error: mapDbError(error.message) }, { status: 500 });
  return Response.json({ opportunities: (data ?? []).map(rowToOpp) });
}

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "database not configured" }, { status: 503 });

  const body = await request.json();
  const session_id = body.session_id as string | undefined;
  const action = (body.action as string) || "research";

  if (!session_id) return Response.json({ error: "session_id required" }, { status: 400 });

  if (action === "research") {
    const { data: campaign } = await sb
      .from("distribution_campaigns")
      .select("*")
      .eq("session_id", session_id)
      .maybeSingle();
    if (!campaign) {
      return Response.json({ error: "distribution campaign not configured" }, { status: 400 });
    }
    if (campaign.autonomous_paused) {
      return Response.json({ error: "paused" }, { status: 423 });
    }

    const [session, brand] = await Promise.all([
      sb
        .from("agent_sessions")
        .select("domain, canonical_domain, hermes_session_id")
        .eq("id", session_id)
        .maybeSingle(),
      sb.from("brand_profiles").select("*").eq("session_id", session_id).maybeSingle(),
    ]);

    const domain = (session?.data?.canonical_domain ||
      session?.data?.domain ||
      "unknown") as string;
    const dossier = dossierFromBrandPayload(brand.data);
    const result = await researchDistributionOpportunities({
      sessionId: session_id,
      goal: campaign.goal,
      angle: campaign.angle || "",
      domain,
      dossier,
      hermesSessionId:
        typeof session?.data?.hermes_session_id === "string"
          ? `kami-dist-${session.data.hermes_session_id}`
          : undefined,
    });

    const rows = result.opportunities.map((o) => ({
      session_id,
      campaign_id: campaign.id,
      platform: o.platform,
      source_url: o.source_url,
      evidence: o.evidence,
      why_now: o.why_now,
      suggested_action: o.suggested_action,
      draft: o.draft,
      risks: o.risks,
      approval_status: o.approval_status,
      action_status: o.action_status,
      outcome: o.outcome,
      agent_skill: o.agent_skill,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await sb.from("distribution_opportunities").insert(rows).select("*");
    if (error) return Response.json({ error: mapDbError(error.message) }, { status: 500 });

    logAgentRunAsync({
      sessionId: session_id,
      source: "pipeline",
      kind: "distribution_opportunities",
      agent: "marketing_strategist",
      status: result.source === "hermes" ? "ok" : "fallback",
      outputJson: {
        source: result.source,
        note: result.note ?? null,
        count: (data ?? []).length,
        opportunities: (data ?? []).map(rowToOpp),
      },
      outputText: (data ?? []).map((r) => `${r.platform}: ${r.why_now}`).join("\n"),
    });

    return Response.json({
      opportunities: (data ?? []).map(rowToOpp),
      source: result.source,
      note: result.note ?? null,
    });
  }

  // Patch a single opportunity
  const id = body.id as string | undefined;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.approval_status) patch.approval_status = body.approval_status;
  if (body.action_status) patch.action_status = body.action_status;
  if (body.outcome) patch.outcome = body.outcome;
  if (typeof body.published_url === "string") patch.published_url = body.published_url;
  if (typeof body.draft === "string") patch.draft = body.draft;
  if (typeof body.source_url === "string") patch.source_url = body.source_url;

  const { data, error } = await sb
    .from("distribution_opportunities")
    .update(patch)
    .eq("id", id)
    .eq("session_id", session_id)
    .select("*")
    .single();
  if (error) return Response.json({ error: mapDbError(error.message) }, { status: 500 });
  return Response.json({ opportunity: rowToOpp(data) });
}
