import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { getSalesConfig, saveSalesSetup, SalesSetupInput, setSalesPaused } from "@/lib/sales/setup";

const Query = z.object({ session_id: ids.sessionId });

/** The session's Sales setup, or `{ config: null }` before setup has run. */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json({ config: await getSalesConfig(db(), session_id) });
});

const Body = SalesSetupInput.extend({ session_id: ids.sessionId });

export const POST = route(async (request) => {
  const { session_id, ...input } = await parseBody(request, Body);
  return Response.json(await saveSalesSetup(db(), session_id, input));
});

const PauseBody = z.object({ session_id: ids.sessionId, autonomous_paused: z.boolean() });

/** Sales-area pause (the campaign-wide kill switch is PUT /api/sessions/[id]/pause). */
export const PATCH = route(async (request) => {
  const { session_id, autonomous_paused } = await parseBody(request, PauseBody);
  return Response.json(await setSalesPaused(db(), session_id, autonomous_paused));
});
