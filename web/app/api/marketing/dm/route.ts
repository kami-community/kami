import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, route } from "@/lib/http/route";
import { sendMarketingDm } from "@/lib/outbound/marketingDm";

export const maxDuration = 60;

const Body = z.object({
  session_id: ids.sessionId,
  crm_entry_id: ids.uuid,
  body: z.string().max(10_000).optional(),
  goal: z.enum(["negotiate_collab", "drive_signup", "book_demo"]).optional(),
});

/** Send the first outreach DM to a CRM entry from the session's connected X or Instagram account. */
export const POST = route(async (request) => {
  const input = await parseBody(request, Body);
  const { receipt, conversationId, account } = await sendMarketingDm(db(), {
    sessionId: input.session_id,
    crmEntryId: input.crm_entry_id,
    text: input.body,
    goal: input.goal,
  });
  return Response.json({ sent: true, conversation_id: conversationId, account, receipt });
});
