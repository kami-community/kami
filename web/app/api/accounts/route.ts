import { supabaseServer } from "@/lib/supabase";
import { oauthConfigured as xOauthConfigured } from "@/lib/xOauth";
import { igOauthConfigured } from "@/lib/igOauth";
import { readClaimId } from "@/lib/claimCookie";

// GET: list connected accounts for this browser claim and/or session (tokens never returned).
export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const claimId = readClaimId(request);

  if (!sb) {
    return Response.json({
      accounts: [],
      oauth: { x: xOauthConfigured(), instagram: igOauthConfigured() },
    });
  }

  let query = sb
    .from("connected_accounts")
    .select("id, platform, handle, status, session_id, claim_id, created_at")
    .order("created_at");

  if (sessionId) {
    query = query.eq("session_id", sessionId);
  } else if (claimId) {
    query = query.eq("claim_id", claimId);
  } else {
    // No claim / session — do not leak other users' accounts
    return Response.json({
      accounts: [],
      oauth: { x: xOauthConfigured(), instagram: igOauthConfigured() },
    });
  }

  const { data } = await query;
  return Response.json({
    accounts: data ?? [],
    oauth: { x: xOauthConfigured(), instagram: igOauthConfigured() },
  });
}

// POST: register a pending connection for platforms without a real flow yet
export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  const { platform, handle } = await request.json();
  if (!platform) return Response.json({ error: "platform required" }, { status: 400 });
  if (platform === "x") {
    return Response.json({ error: "connect X via /api/auth/x/login" }, { status: 400 });
  }
  if (platform === "instagram") {
    return Response.json(
      { error: "connect Instagram via /api/auth/instagram/login" },
      { status: 400 },
    );
  }
  if (!sb) return Response.json({ persisted: false, status: "pending" });

  const claimId = readClaimId(request);
  const { data, error } = await sb
    .from("connected_accounts")
    .insert({
      platform,
      handle: handle ?? null,
      status: "pending",
      claim_id: claimId,
    })
    .select("id, platform, handle, status")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ persisted: true, account: data });
}
