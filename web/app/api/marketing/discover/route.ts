import { supabaseServer } from "@/lib/supabase";
import { runMarketingDiscovery } from "@/lib/marketingDiscover";
import type { MarketingConfig, MarketingPlatform } from "@/lib/marketingTypes";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { session_id } = await request.json();
  if (!session_id) {
    return Response.json({ error: "session_id required" }, { status: 400 });
  }

  const { data: config, error } = await sb
    .from("marketing_config")
    .select("*")
    .eq("session_id", session_id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!config) {
    return Response.json({ error: "no marketing config found" }, { status: 404 });
  }

  if (config.autonomous_paused) {
    return Response.json(
      { error: "marketing autonomous actions are paused for this session", paused: true },
      { status: 423 },
    );
  }

  const platforms = (config.platforms ?? []) as MarketingPlatform[];
  if (!platforms.length) {
    return Response.json({ error: "no platforms configured for discovery" }, { status: 400 });
  }

  const [{ data: session }, { data: brand }] = await Promise.all([
    sb
      .from("agent_sessions")
      .select("domain, hermes_session_id")
      .eq("id", session_id)
      .maybeSingle(),
    sb
      .from("brand_profiles")
      .select("raw_dossier, company, competitor_analysis")
      .eq("session_id", session_id)
      .maybeSingle(),
  ]);

  const marketingConfig: MarketingConfig = {
    id: config.id,
    session_id,
    platforms,
    x_boost_budget: config.x_boost_budget ?? undefined,
    x_outreach_goal: config.x_outreach_goal ?? undefined,
    ig_offer_min: config.ig_offer_min ?? undefined,
    ig_offer_max: config.ig_offer_max ?? undefined,
    ig_niche_keywords: config.ig_niche_keywords ?? undefined,
    ig_min_followers: config.ig_min_followers ?? undefined,
    tone: config.tone ?? undefined,
    autonomous_paused: config.autonomous_paused ?? false,
  };

  let discovered;
  try {
    discovered = await runMarketingDiscovery({
      config: marketingConfig,
      domain: session?.domain ?? null,
      dossier: brand?.raw_dossier ?? {
        company: brand?.company ?? null,
        competitor_analysis: brand?.competitor_analysis ?? null,
      },
      hermesSessionId: `kami-mkt-discover-${session_id}`,
      sessionId: session_id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "discovery failed";
    return Response.json({ error: msg }, { status: 502 });
  }

  if (discovered.needsInput) {
    return Response.json(
      {
        triggered: false,
        platforms,
        created: 0,
        needs_input: discovered.needsInput,
        message: discovered.needsInput.message,
      },
      { status: 422 },
    );
  }

  let created = 0;
  let updated = 0;
  const handles: string[] = [];

  for (const entry of discovered.entries) {
    if (!platforms.includes(entry.platform)) continue;

    const { data: existing } = await sb
      .from("marketing_crm")
      .select("id")
      .eq("session_id", session_id)
      .eq("platform", entry.platform)
      .eq("handle", entry.handle)
      .maybeSingle();

    const offerDefault =
      entry.type === "creator" && config.ig_offer_min != null && config.ig_offer_max != null
        ? Math.round((Number(config.ig_offer_min) + Number(config.ig_offer_max)) / 2)
        : null;

    if (existing) {
      const { error: upErr } = await sb
        .from("marketing_crm")
        .update({
          name: entry.name ?? undefined,
          followers: entry.followers ?? undefined,
          engagement_rate: entry.engagement_rate ?? undefined,
          niche_match_score: entry.niche_match_score ?? undefined,
          relevance_reasoning: entry.relevance_reasoning ?? undefined,
          offer_amount: entry.offer_amount ?? offerDefault ?? undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (!upErr) {
        updated += 1;
        handles.push(entry.handle);
      }
      continue;
    }

    const { error: insErr } = await sb.from("marketing_crm").insert({
      session_id,
      type: entry.type,
      platform: entry.platform,
      handle: entry.handle,
      name: entry.name ?? null,
      followers: entry.followers ?? null,
      engagement_rate: entry.engagement_rate ?? null,
      niche_match_score: entry.niche_match_score ?? null,
      relevance_reasoning: entry.relevance_reasoning ?? null,
      offer_amount: entry.offer_amount ?? offerDefault,
      status: "identified",
    });
    if (!insErr) {
      created += 1;
      handles.push(entry.handle);
    }
  }

  return Response.json({
    triggered: true,
    platforms,
    created,
    updated,
    handles,
    warnings: discovered.warnings ?? [],
    message:
      created + updated > 0
        ? `Discovery complete — ${created} new, ${updated} updated.`
        : "Discovery finished but returned no CRM entries.",
  });
}
