import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import {
  CRM_ENTRY_TYPES,
  CRM_STATUSES,
  listCrmEntries,
  updateCrmStatus,
  upsertCrmEntry,
} from "@/lib/marketing/crm";
import { MARKETING_PLATFORMS } from "@/lib/marketing/setup";

const Query = z.object({
  session_id: ids.sessionId,
  type: z.enum(CRM_ENTRY_TYPES).optional(),
  status: z.enum(CRM_STATUSES).optional(),
});

export const GET = route(async (request) => {
  const { session_id, type, status } = parseQuery(request, Query);
  return Response.json({ entries: await listCrmEntries(db(), session_id, { type, status }) });
});

const StatusUpdate = z.object({
  session_id: ids.sessionId,
  id: ids.uuid,
  status: z.enum(CRM_STATUSES),
});

const score = z.number().min(0).max(1);
const EntryUpsert = z.object({
  session_id: ids.sessionId,
  type: z.enum(CRM_ENTRY_TYPES),
  platform: z.enum(MARKETING_PLATFORMS),
  handle: z
    .string()
    .trim()
    .regex(/^@?[\w.]{1,64}$/, "handle must be an @handle"),
  name: z.string().trim().max(200).optional(),
  followers: z.number().int().min(0).optional(),
  engagement_rate: score.optional(),
  niche_match_score: score.optional(),
  relevance_reasoning: z.string().trim().max(2_000).optional(),
  offer_amount: z.number().finite().min(0).optional(),
  status: z.enum(CRM_STATUSES).optional(),
});

/** Update an entry's status by id, or add/refresh an entry by platform + handle. */
export const POST = route(async (request) => {
  const body = await parseBody(request, z.union([StatusUpdate, EntryUpsert]));
  if ("id" in body) {
    const { id } = await updateCrmStatus(db(), {
      sessionId: body.session_id,
      id: body.id,
      status: body.status,
    });
    return Response.json({ persisted: true, id, updated: true });
  }
  const { session_id, ...entry } = body;
  const { id, updated } = await upsertCrmEntry(db(), session_id, entry);
  return Response.json({ persisted: true, id, updated });
});
