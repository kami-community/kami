import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseQuery, route } from "@/lib/http/route";
import { getPipeline } from "@/lib/sales/pipeline";

const Query = z.object({ session_id: ids.sessionId });

/** `{ pipeline: { [stage]: accounts[] }, total }` for the campaign. */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json(await getPipeline(db(), session_id));
});
