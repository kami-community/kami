import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, route } from "@/lib/http/route";
import { findContacts } from "@/lib/sales/contacts";

export const maxDuration = 600;

const Body = z.object({
  session_id: ids.sessionId,
  account_ids: z.array(ids.uuid).max(100).optional(),
});

/**
 * Look up public contact emails for accounts missing them. Never invents —
 * only persists emails found on or attributed to the company's own domain.
 */
export const POST = route(async (request) => {
  const { session_id, account_ids } = await parseBody(request, Body);
  return Response.json(await findContacts(db(), session_id, account_ids));
});
