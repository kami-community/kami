import { z } from "zod";
import { getCampaignProgress } from "@/lib/campaigns/progress";
import { db } from "@/lib/db/client";
import { ids, route } from "@/lib/http/route";

const Params = z.object({ id: ids.sessionId });

/** Where the campaign stands: gated step completion and what needs the founder. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_request, { params }) => {
  const { id } = Params.parse(await params);
  return Response.json(await getCampaignProgress(db(), id));
});
