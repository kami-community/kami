import { supabaseServer } from "@/lib/supabase";
import type { SalesTask, SalesTaskPriority, SalesTaskStatus } from "@/lib/salesTypes";

function rowToTask(row: Record<string, unknown>): SalesTask {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    account_id: row.account_id as string | undefined,
    contact_id: row.contact_id as string | undefined,
    conversation_id: row.conversation_id as string | undefined,
    title: row.title as string,
    description: row.description as string | undefined,
    status: row.status as SalesTaskStatus,
    priority: row.priority as SalesTaskPriority,
    due_at: row.due_at as string | undefined,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ tasks: [] });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const status = url.searchParams.get("status");

  if (!sessionId) return Response.json({ tasks: [] });

  let query = sb
    .from("sales_tasks")
    .select("*")
    .eq("session_id", sessionId)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ tasks: (data ?? []).map(rowToTask) });
}

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const body = await request.json();
  const {
    session_id,
    title,
    description,
    account_id,
    contact_id,
    conversation_id,
    priority,
    due_at,
  } = body as {
    session_id: string;
    title: string;
    description?: string;
    account_id?: string;
    contact_id?: string;
    conversation_id?: string;
    priority?: SalesTaskPriority;
    due_at?: string;
  };

  if (!session_id || !title) {
    return Response.json({ error: "session_id and title required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("sales_tasks")
    .insert({
      session_id,
      title,
      description: description ?? null,
      account_id: account_id ?? null,
      contact_id: contact_id ?? null,
      conversation_id: conversation_id ?? null,
      priority: priority ?? "medium",
      due_at: due_at ?? null,
      status: "open",
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ task: rowToTask(data) });
}

export async function PATCH(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const body = await request.json();
  const { id, status, priority, title, description, due_at } = body as {
    id: string;
    status?: SalesTaskStatus;
    priority?: SalesTaskPriority;
    title?: string;
    description?: string;
    due_at?: string;
  };

  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (priority) updates.priority = priority;
  if (title) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (due_at !== undefined) updates.due_at = due_at;

  const { data, error } = await sb
    .from("sales_tasks")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ task: rowToTask(data) });
}
