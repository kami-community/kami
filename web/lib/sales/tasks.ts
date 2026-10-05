import type { Db } from "@/lib/db/client";
import { AppError, notFound } from "@/lib/http/errors";
import type { SalesTask, SalesTaskPriority, SalesTaskStatus } from "@/lib/salesTypes";

/** Founder follow-up tasks for one Sales campaign. */

export const TASK_STATUSES = [
  "open",
  "in_progress",
  "done",
  "cancelled",
] as const satisfies readonly SalesTaskStatus[];
export const TASK_PRIORITIES = [
  "low",
  "medium",
  "high",
  "urgent",
] as const satisfies readonly SalesTaskPriority[];

function rowToTask(row: Record<string, unknown>): SalesTask {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    account_id: (row.account_id as string | null) ?? undefined,
    contact_id: (row.contact_id as string | null) ?? undefined,
    conversation_id: (row.conversation_id as string | null) ?? undefined,
    title: row.title as string,
    description: (row.description as string | null) ?? undefined,
    status: row.status as SalesTaskStatus,
    priority: row.priority as SalesTaskPriority,
    due_at: (row.due_at as string | null) ?? undefined,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

export async function listTasks(
  db: Db,
  sessionId: string,
  filter: { status?: SalesTaskStatus; accountId?: string } = {},
): Promise<SalesTask[]> {
  let query = db
    .from("sales_tasks")
    .select("*")
    .eq("session_id", sessionId)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.accountId) query = query.eq("account_id", filter.accountId);
  const { data, error } = await query;
  if (error) throw new AppError("internal", error.message);
  return (data ?? []).map(rowToTask);
}

/** A task may only link to accounts, contacts and conversations of its own campaign. */
async function assertLinkedRowInSession(
  db: Db,
  sessionId: string,
  table: "sales_accounts" | "sales_contacts" | "sales_conversations",
  id: string | undefined,
): Promise<void> {
  if (!id) return;
  const { data, error } = await db
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data)
    throw notFound(`${table.replace("sales_", "").replace(/s$/, "")} not found for this campaign`);
}

export interface NewTask {
  sessionId: string;
  title: string;
  description?: string;
  accountId?: string;
  contactId?: string;
  conversationId?: string;
  priority?: SalesTaskPriority;
  dueAt?: string;
}

export async function createTask(db: Db, input: NewTask): Promise<SalesTask> {
  await Promise.all([
    assertLinkedRowInSession(db, input.sessionId, "sales_accounts", input.accountId),
    assertLinkedRowInSession(db, input.sessionId, "sales_contacts", input.contactId),
    assertLinkedRowInSession(db, input.sessionId, "sales_conversations", input.conversationId),
  ]);

  const { data, error } = await db
    .from("sales_tasks")
    .insert({
      session_id: input.sessionId,
      title: input.title,
      description: input.description ?? null,
      account_id: input.accountId ?? null,
      contact_id: input.contactId ?? null,
      conversation_id: input.conversationId ?? null,
      priority: input.priority ?? "medium",
      due_at: input.dueAt ?? null,
      status: "open",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new AppError("internal", error.message);
  return rowToTask(data);
}

export interface TaskPatch {
  status?: SalesTaskStatus;
  priority?: SalesTaskPriority;
  title?: string;
  /** `null` clears the field. */
  description?: string | null;
  dueAt?: string | null;
}

export async function updateTask(
  db: Db,
  params: { sessionId: string; id: string; patch: TaskPatch },
): Promise<SalesTask> {
  const { patch } = params;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.priority !== undefined) updates.priority = patch.priority;
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.dueAt !== undefined) updates.due_at = patch.dueAt;

  const { data, error } = await db
    .from("sales_tasks")
    .update(updates)
    .eq("id", params.id)
    .eq("session_id", params.sessionId)
    .select("*")
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("task not found for this campaign");
  return rowToTask(data);
}
