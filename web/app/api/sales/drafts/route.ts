import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { sendSalesTouchpoint } from "@/lib/outbound/salesEmail";
import { emailProvider } from "@/lib/providers";
import {
  approveTouchpoint,
  editTouchpoint,
  listDrafts,
  reviewTouchpoint,
} from "@/lib/sales/drafts";

const Query = z.object({ session_id: ids.sessionId, status: z.string().optional() });

export const GET = route(async (request) => {
  const { session_id, status } = parseQuery(request, Query);
  return Response.json({ drafts: await listDrafts(db(), session_id, status) });
});

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["review", "approve", "send"]),
    session_id: ids.sessionId,
    touchpoint_id: ids.uuid,
  }),
  z.object({
    action: z.literal("edit"),
    session_id: ids.sessionId,
    touchpoint_id: ids.uuid,
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5000),
  }),
]);

export const POST = route(async (request) => {
  const body = await parseBody(request, Body);
  const { session_id, touchpoint_id } = body;
  if (body.action === "edit") {
    return Response.json(
      await editTouchpoint(db(), session_id, touchpoint_id, {
        subject: body.subject,
        body: body.body,
      }),
    );
  }
  switch (body.action) {
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
