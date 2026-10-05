import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { boostsConfigured, createBoost, CreateBoostInput, listBoosts } from "@/lib/marketing/boost";

const Query = z.object({ session_id: ids.sessionId });

/** Boosts for this campaign, plus whether paid boosts are configured at all. */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json({
    boosts: await listBoosts(db(), session_id),
    configured: boostsConfigured(),
  });
});

/** Create a paid X boost. The founder's confirmed click (spend shown) is the approval. */
export const POST = route(async (request) => {
  const input = await parseBody(request, CreateBoostInput);
  return Response.json({ boost: await createBoost(db(), input) });
});
