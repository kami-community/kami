import { z } from "zod";
import { db } from "@/lib/db/client";
import { rewritePassage } from "@/lib/drafting/rewrite";
import { ids, parseBody, route } from "@/lib/http/route";

export const maxDuration = 120;

const Body = z.object({
  session_id: ids.sessionId,
  subject: z.object({
    type: z.enum(["sales_touchpoint", "distribution_opportunity"]),
    id: ids.uuid,
  }),
  selection: z.string().trim().min(3).max(2000),
  instruction: z.string().trim().min(2).max(300),
});

/** Propose a rewrite of one passage of a stored draft (nothing is saved). */
export const POST = route(async (request) => {
  const body = await parseBody(request, Body);
  return Response.json(
    await rewritePassage(db(), {
      sessionId: body.session_id,
      subject: body.subject,
      selection: body.selection,
      instruction: body.instruction,
    }),
  );
});
