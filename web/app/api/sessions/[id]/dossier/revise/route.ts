import { z } from "zod";
import { reviseDossier } from "@/lib/campaigns/dossier";
import { db } from "@/lib/db/client";
import { ids, parseBody, route } from "@/lib/http/route";

export const maxDuration = 300;

const Params = z.object({ id: ids.sessionId });
const Body = z.object({ correction: z.string().trim().min(3).max(2000) });

/** Regenerate the dossier from the founder's correction ("that's not quite us…"). */
export const POST = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = Params.parse(await params);
  const { correction } = await parseBody(request, Body);
  return Response.json({ dossier: await reviseDossier(db(), id, correction) });
});
