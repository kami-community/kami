import { z } from "zod";
import { pendingOAuthCookie } from "@/lib/connections/oauthCookie";
import { OAUTH_PROVIDERS } from "@/lib/connections/providers";
import { notConfigured, notFound } from "@/lib/http/errors";
import { ids, parseQuery, route } from "@/lib/http/route";
import { db } from "@/lib/db/client";

const Params = z.object({ platform: z.enum(["x", "instagram"]) });
const Query = z.object({ session_id: ids.sessionId });

/** Start connecting an X or Instagram account to a campaign session. */
export const GET = route<{ params: Promise<{ platform: string }> }>(async (request, { params }) => {
  const { platform } = Params.parse(await params);
  const { session_id } = parseQuery(request, Query);
  const provider = OAUTH_PROVIDERS[platform];
  if (!provider.configured()) throw notConfigured(`${platform} OAuth app keys are not configured`);

  const { data: session } = await db()
    .from("agent_sessions")
    .select("id")
    .eq("id", session_id)
    .maybeSingle();
  if (!session) throw notFound("campaign session not found");

  const auth = provider.authorize();
  return new Response(null, {
    status: 307,
    headers: {
      Location: auth.url,
      "Set-Cookie": pendingOAuthCookie(platform, {
        state: auth.state,
        sessionId: session_id,
        verifier: auth.verifier,
      }),
    },
  });
});
