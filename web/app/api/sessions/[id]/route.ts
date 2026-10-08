import { z } from "zod";
import { getCampaign } from "@/lib/campaigns/sessions";
import { db } from "@/lib/db/client";
import { ids, route } from "@/lib/http/route";

const Params = z.object({ id: ids.sessionId });

/** The campaign session and its dossier. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_request, { params }) => {
  const { id } = Params.parse(await params);
  return Response.json(await getCampaign(db(), id));
});
