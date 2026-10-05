import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { createSequence, listSequences } from "@/lib/sales/sequences";

const Query = z.object({ session_id: ids.sessionId });

export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json(await listSequences(db(), session_id));
});

const Body = z.object({
  session_id: ids.sessionId,
  account_ids: z.array(ids.uuid).max(100).optional(),
  name: z.string().trim().min(1).max(200).optional(),
});

/** Draft a 3-step email sequence for the selected (or ready-for-approval) accounts. */
export const POST = route(async (request) => {
  const body = await parseBody(request, Body);
  return Response.json(
    await createSequence(db(), {
      sessionId: body.session_id,
      accountIds: body.account_ids,
      name: body.name,
    }),
  );
});
