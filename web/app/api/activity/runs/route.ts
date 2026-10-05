import { z } from "zod";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { ids, parseQuery, route } from "@/lib/http/route";

const Query = z.object({
  session_id: ids.sessionId,
  kind: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Every agent run for a campaign: input, output, status and timing. */
export const GET = route(async (request) => {
  const { session_id, kind, limit } = parseQuery(request, Query);
  let query = db()
    .from("agent_run_logs")
    .select(
      "id, hermes_session_id, source, kind, agent, status, model, input_preview, output_text, error, duration_ms, created_at",
    )
    .eq("session_id", session_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw new AppError("internal", error.message);
  return Response.json({ runs: data ?? [] });
});
