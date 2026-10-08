import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { addSuppression, listSuppressions, removeSuppression } from "@/lib/outbound/suppressions";

const Query = z.object({ session_id: ids.sessionId });

/** Suppressions that apply to this campaign (its own plus global ones). */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json({ suppressions: await listSuppressions(db(), session_id) });
});

const Body = z.object({
  session_id: ids.sessionId,
  identifier: z
    .string()
    .trim()
    .min(3)
    .max(320)
    .regex(
      /^(@[\w.]+|[^\s@]+@[^\s@]+\.[^\s@]+|[a-z0-9-]+(\.[a-z0-9-]+)+)$/i,
      "use an email, a domain or an @handle",
    ),
  reason: z.string().trim().min(1).max(200),
  channel: z.enum(["email", "x", "instagram"]).nullable().default(null),
  /** Apply to every campaign instead of just this one. */
  global: z.boolean().default(false),
});

export const POST = route(async (request) => {
  const body = await parseBody(request, Body);
  const suppression = await addSuppression(db(), {
    sessionId: body.global ? null : body.session_id,
    channel: body.channel,
    identifier: body.identifier,
    reason: body.reason,
    source: "user",
  });
  return Response.json({ suppression });
});

const DeleteQuery = Query.extend({ id: ids.uuid });

export const DELETE = route(async (request) => {
  const { session_id, id } = parseQuery(request, DeleteQuery);
  await removeSuppression(db(), session_id, id);
  return Response.json({ ok: true });
});
