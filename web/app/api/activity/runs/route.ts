import { z } from "zod";
import { listRuns } from "@/lib/activity/runs";
import { db } from "@/lib/db/client";
import { ids, parseQuery, route } from "@/lib/http/route";

const Query = z.object({
  session_id: ids.sessionId,
  kind: z.string().max(60).optional(),
  agent: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Every agent run for a campaign — running, stale and finished — with input, output and timing. */
export const GET = route(async (request) => {
  const { session_id, ...filter } = parseQuery(request, Query);
  return Response.json({ runs: await listRuns(db(), session_id, filter) });
});
