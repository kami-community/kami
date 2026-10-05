import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseQuery, route } from "@/lib/http/route";
import { listReceipts } from "@/lib/outbound/receipts";

const Query = z.object({
  session_id: ids.sessionId,
  channel: z.enum(["email", "x_post", "x_dm", "ig_dm"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** Every real send, post and DM for a campaign — the outbound ledger. */
export const GET = route(async (request) => {
  const { session_id, channel, limit } = parseQuery(request, Query);
  return Response.json({ receipts: await listReceipts(db(), session_id, { channel, limit }) });
});
