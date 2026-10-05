import { z } from "zod";
import { ids, parseQuery, route } from "@/lib/http/route";
import { listKanbanTasks, listRuns, localStateAvailable } from "@/lib/hermes/localState";

const Query = z.object({ session_id: ids.sessionId });

/** Hermes' own record of this campaign's agent sessions (local installs only). */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  if (!localStateAvailable()) return Response.json({ available: false, runs: [], tasks: [] });
  const runs = listRuns(session_id).map((r) => ({
    id: r.id,
    started_at: r.started_at ? new Date(r.started_at * 1000).toISOString() : null,
    duration_s: r.ended_at && r.started_at ? Math.round(r.ended_at - r.started_at) : null,
    messages: r.message_count,
    tool_calls: r.tool_call_count,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cost_usd: r.estimated_cost_usd,
    model: r.model,
  }));
  return Response.json({ available: true, runs, tasks: listKanbanTasks() });
});
