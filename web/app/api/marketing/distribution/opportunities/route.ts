import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import {
  listOpportunities,
  researchOpportunities,
  updateOpportunity,
} from "@/lib/marketing/distribution";

export const maxDuration = 300;

const Query = z.object({ session_id: ids.sessionId });

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("research"), session_id: ids.sessionId }),
  z.object({
    action: z.literal("update"),
    session_id: ids.sessionId,
    id: ids.uuid,
    approval_status: z.enum(["needs_review", "approved", "skipped"]).optional(),
    action_status: z.enum(["draft", "ready", "posted_manual", "failed"]).optional(),
    outcome: z
      .enum([
        "none",
        "posted",
        "got_reply",
        "got_interest",
        "got_signup",
        "not_relevant",
        "skipped",
      ])
      .optional(),
    published_url: z.string().url().max(2000).optional(),
    draft: z.string().max(10_000).optional(),
    source_url: z.string().max(2000).optional(),
  }),
]);

/** The campaign's distribution opportunity queue. */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json({ opportunities: await listOpportunities(db(), session_id) });
});

/** Research new opportunities, or record the founder's edits/outcome on one. */
export const POST = route(async (request) => {
  const body = await parseBody(request, Body);
  if (body.action === "research") {
    return Response.json(await researchOpportunities(db(), body.session_id));
  }
  const { approval_status, action_status, outcome, published_url, draft, source_url } = body;
  const edits = { approval_status, action_status, outcome, published_url, draft, source_url };
  return Response.json({
    opportunity: await updateOpportunity(db(), body.session_id, body.id, edits),
  });
});
