import { z } from "zod";
import { liveRuns } from "@/lib/activity/runs";
import { db } from "@/lib/db/client";
import { ids, parseQuery, route } from "@/lib/http/route";

const Query = z.object({
  session_id: ids.sessionId,
  recent: z.coerce.number().int().min(0).max(20).default(8),
});

/** Agent runs in flight now plus the latest finished ones (polled by the top-bar indicator). */
export const GET = route(async (request) => {
  const { session_id, recent } = parseQuery(request, Query);
  return Response.json(await liveRuns(db(), session_id, recent));
});
