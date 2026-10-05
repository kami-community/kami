import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseQuery, route } from "@/lib/http/route";
import { listConversations } from "@/lib/sales/conversations";

const Query = z.object({ session_id: ids.sessionId });

export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json({ conversations: await listConversations(db(), session_id) });
});
