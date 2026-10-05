import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { approvePlan, generatePlan, getLatestPlan } from "@/lib/sales/plan";

export const maxDuration = 300;

const Query = z.object({
  session_id: ids.sessionId,
  status: z.enum(["draft", "approved", "superseded"]).optional(),
});

/** The latest plan version (optionally with a given status), or `{ plan: null }`. */
export const GET = route(async (request) => {
  const { session_id, status } = parseQuery(request, Query);
  return Response.json({ plan: await getLatestPlan(db(), session_id, status) });
});

/** `action` omitted (or "generate") drafts a new plan version; "approve" approves one. */
const Body = z.union([
  z.object({ action: z.literal("approve"), session_id: ids.sessionId, plan_id: ids.uuid }),
  z.object({
    action: z.literal("generate").optional(),
    session_id: ids.sessionId,
    revise_note: z.string().trim().max(1000).optional(),
  }),
]);

export const POST = route(async (request) => {
  const body = await parseBody(request, Body);
  if (body.action === "approve") {
    return Response.json(await approvePlan(db(), body.session_id, body.plan_id));
  }
  return Response.json(await generatePlan(db(), body.session_id, body.revise_note));
});
