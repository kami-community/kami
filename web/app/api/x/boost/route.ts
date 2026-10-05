import { supabaseServer } from "@/lib/supabase";

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { post_id, post_text, session_id, budget } = await request.json();
  if (!post_id || !post_text)
    return Response.json({ error: "post_id and post_text required" }, { status: 400 });

  // Real X Ads API deferred until X_ADS_ACCESS_TOKEN + X_ADS_ACCOUNT_ID are set.
  const adsReady = Boolean(process.env.X_ADS_ACCESS_TOKEN && process.env.X_ADS_ACCOUNT_ID);
  const { data, error } = await sb
    .from("boost_campaigns")
    .insert({
      session_id: session_id ?? null,
      post_id,
      post_text,
      budget: budget ?? 50,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    campaign: data,
    ads_connected: adsReady,
    message: adsReady
      ? "Boost campaign created (Ads API pending full wire-up)."
      : "Queued — add X_ADS_ACCESS_TOKEN and X_ADS_ACCOUNT_ID for live boosts.",
  });
}

export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ campaigns: [] });

  const sessionId = new URL(request.url).searchParams.get("session_id");
  let query = sb.from("boost_campaigns").select("*").order("created_at", { ascending: false });
  if (sessionId) query = query.eq("session_id", sessionId);

  const { data } = await query;
  return Response.json({ campaigns: data ?? [] });
}
