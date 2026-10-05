import { z } from "zod";
import { confirmDossier } from "@/lib/campaigns/sessions";
import { db } from "@/lib/db/client";
import { ids, route } from "@/lib/http/route";

const Params = z.object({ id: ids.sessionId });

/** The founder confirms the dossier ("That's us"). */
export const POST = route<{ params: Promise<{ id: string }> }>(async (_request, { params }) => {
  const { id } = Params.parse(await params);
  return Response.json({ dossier_confirmed_at: await confirmDossier(db(), id) });
});
