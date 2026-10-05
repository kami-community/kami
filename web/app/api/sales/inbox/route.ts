import { supabaseServer } from "@/lib/supabase";
import type { SalesNotification } from "@/lib/salesTypes";

function rowToNotification(row: Record<string, unknown>): SalesNotification {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    kind: row.kind as SalesNotification["kind"],
    title: row.title as string,
    body: row.body as string | undefined,
    entity_type: row.entity_type as string | undefined,
    entity_id: row.entity_id as string | undefined,
    read: row.read as boolean,
    created_at: row.created_at as string | undefined,
  };
}

export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ notifications: [], escalations: [] });

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return Response.json({ notifications: [], escalations: [] });

  const { data, error } = await sb
    .from("sales_notifications")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const all = (data ?? []).map(rowToNotification);
  const escalations = all.filter((n) => n.kind === "escalation");
  const notifications = all.filter((n) => n.kind !== "escalation" || n.read === false);

  return Response.json({ notifications, escalations, unread: all.filter((n) => !n.read).length });
}

export async function PATCH(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { id, read } = await request.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const { error } = await sb
    .from("sales_notifications")
    .update({ read: read ?? true })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ updated: true });
}
