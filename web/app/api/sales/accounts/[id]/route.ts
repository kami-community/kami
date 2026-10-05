import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { AccountPatch, getAccountDetail, updateAccount } from "@/lib/sales/accounts";

type Ctx = { params: Promise<{ id: string }> };
const Params = z.object({ id: ids.uuid });
const Query = z.object({ session_id: ids.sessionId });

export const GET = route<Ctx>(async (request, { params }) => {
  const { id } = Params.parse(await params);
  const { session_id } = parseQuery(request, Query);
  return Response.json(await getAccountDetail(db(), session_id, id));
});

const Body = AccountPatch.extend({ session_id: ids.sessionId });

export const PATCH = route<Ctx>(async (request, { params }) => {
  const { id } = Params.parse(await params);
  const { session_id, ...patch } = await parseBody(request, Body);
  return Response.json(await updateAccount(db(), session_id, id, patch));
});
