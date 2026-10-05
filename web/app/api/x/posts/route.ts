import { resolveXAccess } from "@/lib/xCreds";
import { readClaimId } from "@/lib/claimCookie";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const claimId = readClaimId(request);

  const access = await resolveXAccess({ sessionId, claimId });
  if (!access) {
    return Response.json({
      posts: [],
      error: "No X account connected for this session — Log in with X on the landing page",
    });
  }

  try {
    const meRes = await fetch("https://api.x.com/2/users/me", {
      headers: { Authorization: `Bearer ${access.token}` },
    });
    const me = await meRes.json();
    const userId = me.data?.id;
    if (!userId) return Response.json({ posts: [], error: "Could not resolve user" });

    const query = new URLSearchParams({
      max_results: "10",
      "tweet.fields": "public_metrics,created_at",
      exclude: "retweets,replies",
    });
    const res = await fetch(`https://api.x.com/2/users/${userId}/tweets?${query}`, {
      headers: { Authorization: `Bearer ${access.token}` },
    });
    const json = await res.json();
    if (!res.ok)
      return Response.json({ posts: [], error: `X API ${res.status}`, account: access.handle });

    return Response.json({ posts: json.data ?? [], account: access.handle });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "failed";
    return Response.json({ posts: [], error: msg });
  }
}
