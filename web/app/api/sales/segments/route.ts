import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { confirmSegments, getSegments, rederiveSegments } from "@/lib/sales/segments";

export const maxDuration = 120;

const Query = z.object({
  session_id: ids.sessionId,
  refresh: z.enum(["0", "1"]).optional(),
});

export const GET = route(async (request) => {
  const { session_id, refresh } = parseQuery(request, Query);
  return Response.json(await getSegments(db(), session_id, refresh === "1"));
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("derive"), session_id: ids.sessionId }),
  z.object({
    action: z.literal("confirm"),
    session_id: ids.sessionId,
    // Shape is normalized and gated in the service (normalizeSegments + validateSegmentsForConfirm).
    segments: z.array(z.record(z.string(), z.unknown())).min(1).max(20),
  }),
]);

export const POST = route(async (request) => {
  const body = await parseBody(request, Body);
  if (body.action === "derive") {
    return Response.json(await rederiveSegments(db(), body.session_id));
  }
  return Response.json(await confirmSegments(db(), body.session_id, body.segments));
});
