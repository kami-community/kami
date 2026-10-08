import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseQuery, route } from "@/lib/http/route";
import { getInbox } from "@/lib/inbox/inbox";

const Query = z.object({ session_id: ids.sessionId });

/** `{ items, counts }`: everything waiting on the founder in this campaign. */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json(await getInbox(db(), session_id));
});
