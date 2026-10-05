import { supabaseServer } from "@/lib/supabase";
import { setupInvalidatesSegments } from "@/lib/salesSetupIntegrity";
import type { SalesCampaignConfig, SalesChannel, SalesIcp } from "@/lib/salesTypes";

function rowToConfig(row: Record<string, unknown>): SalesCampaignConfig {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    client_id: row.client_id as string | undefined,
    offer: row.offer as string,
    icp: (row.icp ?? {}) as SalesIcp,
    geo: row.geo as string | undefined,
    exclusions: row.exclusions as string[] | undefined,
    deal_range: row.deal_range as SalesCampaignConfig["deal_range"],
    approved_claims: row.approved_claims as string[] | undefined,
    target_quantity: row.target_quantity as number | undefined,
    sender_identity: row.sender_identity as SalesCampaignConfig["sender_identity"],
    daily_send_cap: row.daily_send_cap as number | undefined,
    allowed_channels: row.allowed_channels as SalesChannel[] | undefined,
    autonomous_paused: row.autonomous_paused as boolean | undefined,
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

function normalizeIcp(icp: unknown): SalesIcp {
  if (!icp || typeof icp !== "object") return { titles: [], industries: [] };
  const o = icp as Record<string, unknown>;
  return {
    titles: Array.isArray(o.titles) ? o.titles.map(String) : [],
    industries: Array.isArray(o.industries) ? o.industries.map(String) : [],
    size: typeof o.size === "string" ? o.size : undefined,
    geo: typeof o.geo === "string" ? o.geo : undefined,
  };
}

export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ config: null });

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return Response.json({ config: null });

  const { data } = await sb
    .from("sales_campaigns")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  return Response.json({ config: data ? rowToConfig(data) : null });
}

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ persisted: false });

  const body = await request.json();
  const {
    session_id,
    client_id,
    offer,
    icp,
    geo,
    exclusions,
    deal_range,
    approved_claims,
    target_quantity,
    sender_identity,
    daily_send_cap,
    allowed_channels,
    autonomy,
  } = body;

  if (!session_id || !offer) {
    return Response.json({ error: "session_id and offer required" }, { status: 400 });
  }

  const nextIcp = normalizeIcp(icp);
  const { data: existing } = await sb
    .from("sales_campaigns")
    .select("id, offer, icp, geo, segments, segments_confirmed_at")
    .eq("session_id", session_id)
    .maybeSingle();

  const invalidate = setupInvalidatesSegments(existing, {
    offer,
    icp: nextIcp,
    geo: geo ?? null,
  });

  const row: Record<string, unknown> = {
    session_id,
    client_id: client_id ?? null,
    offer,
    icp: nextIcp,
    geo: geo ?? null,
    exclusions: exclusions ?? null,
    deal_range: deal_range ?? null,
    approved_claims: approved_claims ?? null,
    target_quantity: target_quantity ?? 50,
    sender_identity: sender_identity ?? null,
    daily_send_cap: daily_send_cap ?? 35,
    allowed_channels: allowed_channels ?? ["email"],
    updated_at: new Date().toISOString(),
  };

  if (invalidate) {
    row.segments = null;
    row.segments_confirmed_at = null;
  }

  if (autonomy) {
    if (typeof autonomy.paused === "boolean") row.autonomous_paused = autonomy.paused;
    if (typeof autonomy.auto_followups === "boolean") row.auto_followups = autonomy.auto_followups;
    if (typeof autonomy.require_first_send_approval === "boolean") {
      row.require_first_send_approval = autonomy.require_first_send_approval;
    }
  }

  const { data, error } = await sb
    .from("sales_campaigns")
    .upsert(row, { onConflict: "session_id" })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (invalidate) {
    await sb.from("sales_audit_events").insert({
      session_id,
      actor: "system",
      action: "segments_invalidated",
      entity_type: "sales_campaign",
      entity_id: data.id,
      payload: { reason: "setup_offer_or_icp_changed" },
    });
  }

  return Response.json({
    persisted: true,
    id: data.id,
    config: rowToConfig(data),
    segments_invalidated: invalidate,
  });
}

export async function PATCH(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ persisted: false });

  const { session_id, autonomous_paused } = await request.json();
  if (!session_id || typeof autonomous_paused !== "boolean") {
    return Response.json({ error: "session_id and autonomous_paused required" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("sales_campaigns")
    .update({
      autonomous_paused,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", session_id)
    .select("*")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "no sales campaign found" }, { status: 404 });

  return Response.json({ persisted: true, config: rowToConfig(data) });
}
