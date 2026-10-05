import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, route } from "@/lib/http/route";
import { APPROVAL_SCOPES, grantApproval } from "@/lib/sales/approvals";

const Body = z.object({
  session_id: ids.sessionId,
  scope: z.enum(APPROVAL_SCOPES),
});

/** The founder grants a campaign-level approval (e.g. the first send). */
export const POST = route(async (request) => {
  const { session_id, scope } = await parseBody(request, Body);
  return Response.json(await grantApproval(db(), { sessionId: session_id, scope }));
});
