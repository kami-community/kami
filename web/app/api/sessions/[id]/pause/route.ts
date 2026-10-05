import { z } from "zod";
import { db } from "@/lib/db/client";
import { AppError, notFound } from "@/lib/http/errors";
import { ids, parseBody, route } from "@/lib/http/route";

const Params = z.object({ id: ids.sessionId });
const Body = z.object({ paused: z.boolean() });

/** The campaign kill switch. Every outbound action checks it server-side. */
export const PUT = route<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = Params.parse(await params);
  const { paused } = await parseBody(request, Body);
  const { data, error } = await db()
    .from("agent_sessions")
    .update({ paused })
    .eq("id", id)
    .select("id, paused")
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("campaign session not found");
  return Response.json({ paused: data.paused });
});
