import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { listScores, setInclusion } from "@/lib/sales/scores";

const Query = z.object({ session_id: ids.sessionId });

/** The latest score per account, with the account attached. */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json({ scores: await listScores(db(), session_id) });
});

const Body = z.object({
  session_id: ids.sessionId,
  account_id: ids.uuid,
  included: z.boolean(),
});

/** Include/exclude an account from the outreach cohort. */
export const POST = route(async (request) => {
  const { session_id, account_id, included } = await parseBody(request, Body);
  return Response.json(await setInclusion(db(), session_id, account_id, included));
});
