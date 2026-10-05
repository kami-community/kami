import { listRuns } from "@/lib/hermesDb";

export async function GET(): Promise<Response> {
  const runs = listRuns().map((r) => ({
    id: r.id,
    source: r.source,
    started_at: r.started_at ? new Date(r.started_at * 1000).toISOString() : null,
    duration_s: r.ended_at && r.started_at ? Math.round(r.ended_at - r.started_at) : null,
    messages: r.message_count,
    tool_calls: r.tool_call_count,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cost_usd: r.estimated_cost_usd,
    model: r.model,
  }));

  const totals = runs.reduce(
    (acc, r) => ({
      runs: acc.runs + 1,
      input_tokens: acc.input_tokens + (r.input_tokens ?? 0),
      output_tokens: acc.output_tokens + (r.output_tokens ?? 0),
      tool_calls: acc.tool_calls + (r.tool_calls ?? 0),
    }),
    { runs: 0, input_tokens: 0, output_tokens: 0, tool_calls: 0 },
  );

  return Response.json({ runs, totals });
}
