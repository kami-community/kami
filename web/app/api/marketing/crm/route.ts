import { supabaseServer } from "@/lib/supabase";

export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ entries: [] });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");

  let query = sb
    .from("marketing_crm")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sessionId) query = query.eq("session_id", sessionId);
  if (type) query = query.eq("type", type);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ entries: data ?? [] });
}

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ persisted: false });

  const body = await request.json();
  const {
    id,
    session_id,
    type,
    platform,
    handle,
    name,
    followers,
    engagement_rate,
    niche_match_score,
    relevance_reasoning,
    offer_amount,
    status,
  } = body;

  // Approve / status-update flow: update by id
  if (id && status) {
    const { data, error } = await sb
      .from("marketing_crm")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ persisted: true, id: data.id, updated: true });
  }

  if (!type || !platform || !handle) {
    return Response.json({ error: "type, platform, handle required" }, { status: 400 });
  }

  if (!session_id) {
    return Response.json({ error: "session_id required for upsert" }, { status: 400 });
  }

  const { data: existing } = await sb
    .from("marketing_crm")
    .select("id")
    .eq("session_id", session_id)
    .eq("platform", platform)
    .eq("handle", handle)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from("marketing_crm")
      .update({
        name: name ?? undefined,
        followers: followers ?? undefined,
        engagement_rate: engagement_rate ?? undefined,
        niche_match_score: niche_match_score ?? undefined,
        relevance_reasoning: relevance_reasoning ?? undefined,
        offer_amount: offer_amount ?? undefined,
        status: status ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ persisted: true, id: existing.id, updated: true });
  }

  const { data, error } = await sb
    .from("marketing_crm")
    .insert({
      session_id,
      type,
      platform,
      handle,
      name: name ?? null,
      followers: followers ?? null,
      engagement_rate: engagement_rate ?? null,
      niche_match_score: niche_match_score ?? null,
      relevance_reasoning: relevance_reasoning ?? null,
      offer_amount: offer_amount ?? null,
      status: status ?? "identified",
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ persisted: true, id: data.id });
}
