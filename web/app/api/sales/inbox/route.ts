import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { getInbox, markNotificationRead } from "@/lib/sales/inbox";

const Query = z.object({ session_id: ids.sessionId });

/** `{ notifications, escalations, unread }` for the campaign. */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json(await getInbox(db(), session_id));
});

const PatchBody = z.object({
  session_id: ids.sessionId,
  id: ids.uuid,
  read: z.boolean().default(true),
});

export const PATCH = route(async (request) => {
  const { session_id, id, read } = await parseBody(request, PatchBody);
  await markNotificationRead(db(), { sessionId: session_id, id, read });
  return Response.json({ updated: true });
});
