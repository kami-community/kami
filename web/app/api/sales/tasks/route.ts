import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  createTask,
  listTasks,
  updateTask,
} from "@/lib/sales/tasks";

const Query = z.object({
  session_id: ids.sessionId,
  status: z.enum(TASK_STATUSES).optional(),
  account_id: ids.uuid.optional(),
});

export const GET = route(async (request) => {
  const { session_id, status, account_id } = parseQuery(request, Query);
  return Response.json({
    tasks: await listTasks(db(), session_id, { status, accountId: account_id }),
  });
});

const dueAt = z.iso.datetime({ offset: true });

const CreateBody = z.object({
  session_id: ids.sessionId,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5_000).optional(),
  account_id: ids.uuid.optional(),
  contact_id: ids.uuid.optional(),
  conversation_id: ids.uuid.optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  due_at: dueAt.optional(),
});

export const POST = route(async (request) => {
  const body = await parseBody(request, CreateBody);
  const task = await createTask(db(), {
    sessionId: body.session_id,
    title: body.title,
    description: body.description,
    accountId: body.account_id,
    contactId: body.contact_id,
    conversationId: body.conversation_id,
    priority: body.priority,
    dueAt: body.due_at,
  });
  return Response.json({ task });
});

const PatchBody = z.object({
  session_id: ids.sessionId,
  id: ids.uuid,
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5_000).nullable().optional(),
  due_at: dueAt.nullable().optional(),
});

export const PATCH = route(async (request) => {
  const body = await parseBody(request, PatchBody);
  const task = await updateTask(db(), {
    sessionId: body.session_id,
    id: body.id,
    patch: {
      status: body.status,
      priority: body.priority,
      title: body.title,
      description: body.description,
      dueAt: body.due_at,
    },
  });
  return Response.json({ task });
});
