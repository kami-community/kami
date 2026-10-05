import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, route } from "@/lib/http/route";
import { discoverCrmEntries } from "@/lib/marketing/discovery";

export const maxDuration = 300;

const Body = z.object({ session_id: ids.sessionId });

/** Discover real X leads / Instagram creators into the campaign's CRM. */
export const POST = route(async (request) => {
  const { session_id } = await parseBody(request, Body);
  return Response.json(await discoverCrmEntries(db(), session_id));
});
