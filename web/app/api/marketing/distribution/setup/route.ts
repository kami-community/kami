import { z } from "zod";
import { db } from "@/lib/db/client";
import { DISTRIBUTION_PLATFORMS } from "@/lib/distributionTypes";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { getPlan, recommendPlan, updatePlan } from "@/lib/marketing/distribution";

export const maxDuration = 120;

const Query = z.object({ session_id: ids.sessionId });

const Edits = z.object({
  goal: z.string().trim().min(1).max(60).optional(),
  goal_label: z.string().trim().max(120).optional(),
  angle: z.string().trim().min(1).max(500).optional(),
  surfaces: z.array(z.enum(DISTRIBUTION_PLATFORMS)).max(3).optional(),
  rationale: z.string().trim().max(1000).optional(),
  why_these_surfaces: z.string().trim().max(1000).optional(),
});

const PostBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("recommend"),
    session_id: ids.sessionId,
    revise_note: z.string().trim().max(1000).optional(),
  }),
  Edits.extend({ action: z.literal("approve"), session_id: ids.sessionId }),
]);

const PatchBody = Edits.extend({
  session_id: ids.sessionId,
  status: z.enum(["proposed", "approved", "superseded"]).optional(),
  autonomous_paused: z.boolean().optional(),
});

/** The campaign's distribution plan. */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json({ config: await getPlan(db(), session_id) });
});

/** Recommend (or revise) a plan with the Distribution manager, or approve it. */
export const POST = route(async (request) => {
  const body = await parseBody(request, PostBody);
  if (body.action === "recommend") {
    return Response.json(await recommendPlan(db(), body.session_id, body.revise_note));
  }
  const { session_id, goal, goal_label, angle, surfaces, rationale, why_these_surfaces } = body;
  const edits = { goal, goal_label, angle, surfaces, rationale, why_these_surfaces };
  return Response.json({ config: await updatePlan(db(), session_id, edits, { approve: true }) });
});

/** Save plan edits (and the distribution pause). */
export const PATCH = route(async (request) => {
  const { session_id, ...edits } = await parseBody(request, PatchBody);
  return Response.json({ config: await updatePlan(db(), session_id, edits) });
});
