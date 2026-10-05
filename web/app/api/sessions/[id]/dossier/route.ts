import { z } from "zod";
import { generateDossier, updateDossier } from "@/lib/campaigns/dossier";
import { db } from "@/lib/db/client";
import { ids, parseBody, route } from "@/lib/http/route";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };
const Params = z.object({ id: ids.sessionId });

/** Run the brand-analyst agent and store the dossier. */
export const POST = route<Ctx>(async (_request, { params }) => {
  const { id } = Params.parse(await params);
  return Response.json({ dossier: await generateDossier(db(), id) });
});

const Body = z.object({ dossier: z.record(z.string(), z.unknown()) });

/** Save the founder's direct edits. */
export const PUT = route<Ctx>(async (request, { params }) => {
  const { id } = Params.parse(await params);
  const { dossier } = await parseBody(request, Body);
  return Response.json({ dossier: await updateDossier(db(), id, dossier) });
});
