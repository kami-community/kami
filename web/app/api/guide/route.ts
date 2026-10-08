import { z } from "zod";
import { db } from "@/lib/db/client";
import { askGuide } from "@/lib/guide/guide";
import { ids, parseBody, route } from "@/lib/http/route";

export const maxDuration = 300;

const Body = z.object({
  session_id: ids.sessionId,
  question: z.string().trim().min(1).max(2000),
  active_job: z.enum(["find_customers", "create_distribution"]).nullable().default(null),
});

/** Ask Kami Guide; responds with a server-sent event stream. */
export const POST = route(async (request) => {
  const body = await parseBody(request, Body);
  return askGuide(db(), {
    sessionId: body.session_id,
    question: body.question,
    activeJob: body.active_job,
  });
});
