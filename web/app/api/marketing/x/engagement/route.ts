import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, route } from "@/lib/http/route";
import { refreshXEngagement } from "@/lib/marketing/xEngagement";

const Body = z.object({ session_id: ids.sessionId });

/** Pull fresh metrics and replies for the campaign's published X posts. */
export const POST = route(async (request) => {
  const { session_id } = await parseBody(request, Body);
  return Response.json(await refreshXEngagement(db(), session_id));
});
