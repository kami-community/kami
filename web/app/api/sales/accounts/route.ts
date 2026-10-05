import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { listAccounts, ManualAccount, upsertAccounts } from "@/lib/sales/accounts";

const Query = z.object({ session_id: ids.sessionId });

export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json({ accounts: await listAccounts(db(), session_id) });
});

const Body = z.object({
  session_id: ids.sessionId,
  accounts: z.array(ManualAccount).min(1).max(100),
});

export const POST = route(async (request) => {
  const { session_id, accounts } = await parseBody(request, Body);
  return Response.json(await upsertAccounts(db(), session_id, accounts));
});
