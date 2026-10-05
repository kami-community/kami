import { supabaseServer } from "@/lib/supabase";
import { dossierFromBrandPayload } from "@/lib/guideContext";
import { generateSalesStrategy } from "@/lib/salesStrategy";
import type { SalesCampaignConfig, SalesPlan } from "@/lib/salesTypes";
import type { SalesSegment } from "@/lib/salesSegments";

function rowToPlan(row: Record<string, unknown>): SalesPlan {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    sales_campaign_id: row.sales_campaign_id as string | undefined,
    version: row.version as number,
    motions: (row.motions ?? []) as SalesPlan["motions"],
    tiers: (row.tiers ?? []) as SalesPlan["tiers"],
    channel_rationale: (row.channel_rationale as string) ?? "",
    risks: (row.risks as string[] | null) ?? [],
    prerequisites: (row.prerequisites as string[] | null) ?? [],
    estimated_activity: row.estimated_activity as SalesPlan["estimated_activity"],
    approval_scope: row.approval_scope as SalesPlan["approval_scope"],
    status: row.status as SalesPlan["status"],
    revise_note: row.revise_note as string | undefined,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ plan: null });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const status = url.searchParams.get("status");

  if (!sessionId) return Response.json({ plan: null });

  let query = sb
    .from("sales_plans")
    .select("*")
    .eq("session_id", sessionId)
    .order("version", { ascending: false })
    .limit(1);

  if (status) query = query.eq("status", status);

  const { data } = await query.maybeSingle();
  return Response.json({ plan: data ? rowToPlan(data) : null });
}

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ persisted: false });

  const body = await request.json();
  const { session_id, action, plan_id, revise_note } = body;

  if (!session_id) {
    return Response.json({ error: "session_id required" }, { status: 400 });
  }

  if (action === "approve") {
    if (!plan_id) {
      return Response.json({ error: "plan_id required for approve" }, { status: 400 });
    }

    await sb
      .from("sales_plans")
      .update({ status: "superseded", updated_at: new Date().toISOString() })
      .eq("session_id", session_id)
      .eq("status", "approved");

    const { data, error } = await sb
      .from("sales_plans")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", plan_id)
      .eq("session_id", session_id)
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    await sb.from("sales_audit_events").insert({
      session_id,
      actor: "user",
      action: "plan_approved",
      entity_type: "sales_plan",
      entity_id: plan_id,
      payload: { version: data.version },
    });

    return Response.json({ persisted: true, plan: rowToPlan(data) });
  }

  const { data: campaign } = await sb
    .from("sales_campaigns")
    .select("*")
    .eq("session_id", session_id)
    .maybeSingle();

  if (!campaign) {
    return Response.json({ error: "sales campaign not configured — run setup first" }, { status: 400 });
  }

  const { data: latest } = await sb
    .from("sales_plans")
    .select("version")
    .eq("sales_campaign_id", campaign.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? 0) + 1;
  const config: SalesCampaignConfig = {
    session_id,
    offer: campaign.offer,
    icp: campaign.icp as SalesCampaignConfig["icp"],
    geo: campaign.geo,
    exclusions: campaign.exclusions,
    deal_range: campaign.deal_range,
    approved_claims: campaign.approved_claims,
    target_quantity: campaign.target_quantity,
    sender_identity: campaign.sender_identity,
    daily_send_cap: campaign.daily_send_cap,
    allowed_channels: campaign.allowed_channels,
    autonomy: {
      paused: campaign.autonomous_paused,
      auto_followups: campaign.auto_followups,
      require_first_send_approval: campaign.require_first_send_approval,
    },
    segments: campaign.segments ?? null,
    segments_confirmed_at: campaign.segments_confirmed_at ?? null,
  };

  const segments = Array.isArray(campaign.segments)
    ? (campaign.segments as SalesSegment[])
    : null;

  // Prefer client-supplied plan only when explicitly provided (tests); else Hermes strategist.
  let synthesized = body.plan as Omit<SalesPlan, "id" | "created_at" | "updated_at"> | undefined;
  let source: "client" | "hermes" | "offline_fallback" = "client";
  let note: string | undefined;

  if (!synthesized) {
    const [session, brand] = await Promise.all([
      sb
        .from("agent_sessions")
        .select("domain, canonical_domain, goals_list, hermes_session_id")
        .eq("id", session_id)
        .maybeSingle(),
      sb.from("brand_profiles").select("*").eq("session_id", session_id).maybeSingle(),
    ]);

    const domain = (session?.data?.canonical_domain || session?.data?.domain || "") as string;
    const goalsRaw = session?.data?.goals_list;
    const goals = Array.isArray(goalsRaw)
      ? goalsRaw.filter((g): g is string => typeof g === "string")
      : [];
    const dossier = dossierFromBrandPayload(brand.data);

    const strategist = await generateSalesStrategy({
      domain: domain || "unknown",
      dossier,
      config,
      campaignId: campaign.id,
      version: nextVersion,
      segments,
      goals,
      kamiSessionId: session_id,
      hermesSessionId:
        typeof session?.data?.hermes_session_id === "string"
          ? `kami-sales-plan-${session.data.hermes_session_id}`
          : undefined,
    });
    synthesized = strategist.plan;
    source = strategist.source;
    note = strategist.note;
  }

  const row = {
    session_id,
    sales_campaign_id: campaign.id,
    version: synthesized.version ?? nextVersion,
    motions: synthesized.motions,
    tiers: synthesized.tiers,
    channel_rationale: synthesized.channel_rationale,
    risks: synthesized.risks,
    prerequisites: synthesized.prerequisites,
    estimated_activity: synthesized.estimated_activity,
    approval_scope: synthesized.approval_scope,
    status: "draft",
    revise_note: revise_note ?? note ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb.from("sales_plans").insert(row).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    persisted: true,
    plan: rowToPlan(data),
    source,
    note: note ?? null,
  });
}
