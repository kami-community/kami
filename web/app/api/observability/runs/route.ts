import { supabaseServer } from "@/lib/supabase";

/**
 * List Kami agent_run_logs from Supabase (end-to-end product observability).
 * GET /api/observability/runs?session_id=<uuid>&limit=50
 */
export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) {
    return Response.json(
      {
        error: "database not configured",
        runs: [],
        hint: "Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const kind = url.searchParams.get("kind");
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

  let query = sb
    .from("agent_run_logs")
    .select(
      "id, session_id, hermes_session_id, source, kind, agent, status, model, input_preview, output_text, output_json, error, duration_ms, meta, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (sessionId) query = query.eq("session_id", sessionId);
  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query;
  if (error) {
    const missing =
      /agent_run_logs/i.test(error.message) &&
      /(schema cache|does not exist|Could not find the table)/i.test(error.message);
    return Response.json(
      {
        error: missing
          ? "Apply Supabase migration 010_agent_run_logs.sql, then retry."
          : error.message,
        runs: [],
      },
      { status: 500 },
    );
  }

  return Response.json({ runs: data ?? [], count: data?.length ?? 0 });
}
