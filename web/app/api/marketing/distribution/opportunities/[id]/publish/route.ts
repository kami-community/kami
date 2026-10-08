import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, route } from "@/lib/http/route";
import { publishOpportunityToX } from "@/lib/outbound/distributionPost";

const Params = z.object({ id: ids.uuid });
const Body = z.object({ session_id: ids.sessionId, text: z.string().min(1) });

/** Publish an X distribution opportunity from the connected account. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = Params.parse(await params);
  const { session_id, text } = await parseBody(request, Body);
  const { receipt, account } = await publishOpportunityToX(db(), {
    sessionId: session_id,
    opportunityId: id,
    text,
  });
  return Response.json({ published: true, url: receipt.url, account, receipt });
});
