import { supabaseServer } from "@/lib/supabase";
import type { Dossier } from "@/lib/hermes";
import {
  deriveSalesSegments,
  icpFromSegments,
  normalizeSegments,
  validateSegmentsForConfirm,
  type SalesSegment,
} from "@/lib/salesSegments";
import { dossierFromBrandPayload } from "@/lib/guideContext";

async function loadSessionContext(sessionId: string): Promise<{
  dossier: Dossier | null;
  domain: string;
  goals: string[];
}> {
  const sb = supabaseServer();
  if (!sb) return { dossier: null, domain: "", goals: [] };

  const [session, brand] = await Promise.all([
    sb
      .from("agent_sessions")
      .select("domain, canonical_domain, goals_list")
      .eq("id", sessionId)
      .maybeSingle(),
    sb.from("brand_profiles").select("*").eq("session_id", sessionId).maybeSingle(),
  ]);

  const goalsRaw = session.data?.goals_list;
  const goals = Array.isArray(goalsRaw)
    ? goalsRaw.filter((g): g is string => typeof g === "string")
    : [];

  return {
    domain: (session.data?.canonical_domain || session.data?.domain || "") as string,
    dossier: dossierFromBrandPayload(brand.data),
    goals,
  };
}

export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return Response.json({ error: "session_id required" }, { status: 400 });

  const { data: campaign } = await sb
    .from("sales_campaigns")
    .select("id, segments, segments_confirmed_at")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!campaign) {
    return Response.json({ error: "no sales campaign — run setup first" }, { status: 404 });
  }

  if (campaign.segments_confirmed_at && Array.isArray(campaign.segments) && campaign.segments.length) {
    return Response.json({
      segments: campaign.segments as SalesSegment[],
      confirmed_at: campaign.segments_confirmed_at,
      source: "confirmed",
    });
  }

  // Return cached draft segments without re-running Hermes on every mount.
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  if (!refresh && Array.isArray(campaign.segments) && campaign.segments.length) {
    return Response.json({
      segments: campaign.segments as SalesSegment[],
      confirmed_at: null,
      source: "draft",
    });
  }

  const { dossier, domain, goals } = await loadSessionContext(sessionId);
  if (!domain) return Response.json({ error: "session domain not found" }, { status: 400 });

  const derived = await deriveSalesSegments({
    domain,
    dossier,
    goals,
    kamiSessionId: sessionId,
  });

  // Persist draft so remounts don't loop Hermes derivation.
  await sb
    .from("sales_campaigns")
    .update({
      segments: derived.segments,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaign.id);

  return Response.json({
    segments: derived.segments,
    confirmed_at: null,
    source: derived.source,
  });
}

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const body = await request.json();
  const { session_id, action, segments: rawSegments } = body as {
    session_id?: string;
    action?: "confirm" | "derive";
    segments?: unknown;
  };

  if (!session_id) return Response.json({ error: "session_id required" }, { status: 400 });

  const { data: campaign } = await sb
    .from("sales_campaigns")
    .select("*")
    .eq("session_id", session_id)
    .maybeSingle();

  if (!campaign) {
    return Response.json({ error: "no sales campaign — run setup first" }, { status: 404 });
  }

  if (action === "derive") {
    const { dossier, domain, goals } = await loadSessionContext(session_id);
    if (!domain) return Response.json({ error: "session domain not found" }, { status: 400 });
    const derived = await deriveSalesSegments({
      domain,
      dossier,
      goals,
      kamiSessionId: session_id,
    });
    await sb
      .from("sales_campaigns")
      .update({
        segments: derived.segments,
        segments_confirmed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);
    return Response.json({
      segments: derived.segments,
      confirmed_at: null,
      source: derived.source,
    });
  }

  const segments = normalizeSegments({ segments: rawSegments });
  const validationError = validateSegmentsForConfirm(segments);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  const confirmedAt = new Date().toISOString();
  const icpPatch = icpFromSegments(segments);

  const { data, error } = await sb
    .from("sales_campaigns")
    .update({
      segments,
      segments_confirmed_at: confirmedAt,
      icp: {
        ...(typeof campaign.icp === "object" && campaign.icp ? campaign.icp : {}),
        titles: icpPatch.titles,
        industries: icpPatch.industries,
      },
      updated_at: confirmedAt,
    })
    .eq("id", campaign.id)
    .select("*")
    .single();

  if (error) {
    return Response.json(
      {
        error: error.message.includes("segments")
          ? `segments column missing — apply web/supabase/migrations/007_sales_segments.sql (${error.message})`
          : error.message,
      },
      { status: 500 },
    );
  }

  await sb.from("sales_audit_events").insert({
    session_id,
    actor: "user",
    action: "segments_confirmed",
    entity_type: "sales_campaign",
    entity_id: campaign.id,
    payload: { segment_count: segments.length, keys: segments.map((s) => s.key) },
  });

  return Response.json({
    confirmed: true,
    segments,
    confirmed_at: confirmedAt,
    campaign_id: data.id,
  });
}
