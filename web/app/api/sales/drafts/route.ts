import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { sendSalesTouchpoint } from "@/lib/outbound/salesEmail";
import { emailProvider } from "@/lib/providers";
import { approveTouchpoint, listDrafts, reviewTouchpoint } from "@/lib/sales/drafts";

const Query = z.object({ session_id: ids.sessionId, status: z.string().optional() });

export const GET = route(async (request) => {
  const { session_id, status } = parseQuery(request, Query);
  return Response.json({ drafts: await listDrafts(db(), session_id, status) });
});

const Body = z.object({
  action: z.enum(["review", "approve", "send"]),
  session_id: ids.sessionId,
  touchpoint_id: ids.uuid,
});

export const POST = route(async (request) => {
  const { action, session_id, touchpoint_id } = await parseBody(request, Body);
  switch (action) {
    case "review":
      return Response.json(await reviewTouchpoint(db(), session_id, touchpoint_id));
    case "approve":
      return Response.json(await approveTouchpoint(db(), session_id, touchpoint_id));
    case "send": {
      const receipt = await sendSalesTouchpoint(db(), emailProvider(), {
        sessionId: session_id,
        touchpointId: touchpoint_id,
      });
      return Response.json({ sent: true, receipt });
    }
  }
});
