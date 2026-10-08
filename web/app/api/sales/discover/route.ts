import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, route } from "@/lib/http/route";
import { runDiscovery } from "@/lib/sales/discovery";

/** Discovery + contact lookup can exceed the default ~300s. */
export const maxDuration = 600;

const Body = z.object({ session_id: ids.sessionId });

export const POST = route(async (request) => {
  const { session_id } = await parseBody(request, Body);
  return Response.json(await runDiscovery(db(), session_id));
});
