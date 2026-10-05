import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import {
  MARKETING_PLATFORMS,
  OUTREACH_GOALS,
  getMarketingConfig,
  saveMarketingConfig,
  setMarketingPaused,
} from "@/lib/marketing/setup";

const Query = z.object({ session_id: ids.sessionId });

/** `{ config }` — null until Marketing is set up. */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json({ config: await getMarketingConfig(db(), session_id) });
});

const money = z.number().finite().min(0).max(1_000_000);

const SetupBody = z
  .object({
    session_id: ids.sessionId,
    platforms: z.array(z.enum(MARKETING_PLATFORMS)).min(1, "pick at least one platform"),
    x_boost_budget: money.optional(),
    x_outreach_goal: z.enum(OUTREACH_GOALS).optional(),
    ig_offer_min: money.optional(),
    ig_offer_max: money.optional(),
    ig_niche_keywords: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    ig_min_followers: z.number().int().min(0).optional(),
    tone: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  })
  .refine(
    (b) => b.ig_offer_min == null || b.ig_offer_max == null || b.ig_offer_min <= b.ig_offer_max,
    { message: "ig_offer_min must not exceed ig_offer_max", path: ["ig_offer_min"] },
  );

/** Create or replace the Marketing config (requires the confirmed dossier). */
export const POST = route(async (request) => {
  const body = await parseBody(request, SetupBody);
  const config = await saveMarketingConfig(db(), {
    sessionId: body.session_id,
    platforms: [...new Set(body.platforms)],
    xBoostBudget: body.x_boost_budget,
    xOutreachGoal: body.x_outreach_goal,
    igOfferMin: body.ig_offer_min,
    igOfferMax: body.ig_offer_max,
    igNicheKeywords: body.ig_niche_keywords,
    igMinFollowers: body.ig_min_followers,
    tone: body.tone,
  });
  return Response.json({ persisted: true, id: config.id, config });
});

const PauseBody = z.object({ session_id: ids.sessionId, autonomous_paused: z.boolean() });

/** Pause or resume Marketing outreach for the campaign. */
export const PATCH = route(async (request) => {
  const { session_id, autonomous_paused } = await parseBody(request, PauseBody);
  const config = await setMarketingPaused(db(), {
    sessionId: session_id,
    paused: autonomous_paused,
  });
  return Response.json({ persisted: true, config });
});
