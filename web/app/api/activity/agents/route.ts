import { z } from "zod";
import { agentRoster } from "@/lib/activity/agents";
import { db } from "@/lib/db/client";
import { ids, parseQuery, route } from "@/lib/http/route";

const Query = z.object({ session_id: ids.sessionId });

/** The Hermes agent roster with each agent's role, skills and run statistics for this campaign. */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json(await agentRoster(db(), session_id));
});
