import { z } from "zod";
import { OAUTH_PROVIDERS } from "@/lib/connections/providers";
import { disconnect, listConnections } from "@/lib/connections/service";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db/client";
import { ids, parseQuery, route } from "@/lib/http/route";

const Query = z.object({ session_id: ids.sessionId });
const DeleteQuery = Query.extend({ platform: z.enum(["x", "instagram"]) });

/** Connected accounts for a campaign (tokens are never returned) and which OAuth apps are configured. */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  const c = env();
  return Response.json({
    accounts: await listConnections(db(), session_id),
    configured: {
      x: OAUTH_PROVIDERS.x.configured(),
      instagram: OAUTH_PROVIDERS.instagram.configured(),
      token_encryption: Boolean(c.KAMI_TOKEN_ENCRYPTION_KEY),
      apify: Boolean(c.APIFY_API_TOKEN),
      x_ads: Boolean(c.X_ADS_ACCESS_TOKEN && c.X_ADS_ACCOUNT_ID),
    },
  });
});

export const DELETE = route(async (request) => {
  const { session_id, platform } = parseQuery(request, DeleteQuery);
  await disconnect(db(), session_id, platform);
  return Response.json({ ok: true });
});
