import type { Db } from "@/lib/db/client";
import { AppError, notFound } from "@/lib/http/errors";
import type { DiscoveredCrmEntry } from "@/lib/marketingDiscoverTypes";
import type {
  CreatorStatus,
  CrmEntryType,
  MarketingCrmEntry,
  MarketingPlatform,
  XLeadStatus,
} from "@/lib/marketingTypes";

/** Advanced Marketing CRM: X leads and Instagram creators for one campaign. */

export const CRM_ENTRY_TYPES = ["x_lead", "creator"] as const satisfies readonly CrmEntryType[];
export const CRM_STATUSES = [
  "identified",
  "approved",
  "contacted",
  "in_conversation",
  "converted",
  "lost",
  "negotiating",
  "agreed",
  "content_live",
  "paid",
  "completed",
] as const satisfies readonly (XLeadStatus | CreatorStatus)[];
export type CrmStatus = (typeof CRM_STATUSES)[number];

export async function listCrmEntries(
  db: Db,
  sessionId: string,
  filter: { type?: CrmEntryType; status?: CrmStatus } = {},
): Promise<MarketingCrmEntry[]> {
  let query = db
    .from("marketing_crm")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter.type) query = query.eq("type", filter.type);
  if (filter.status) query = query.eq("status", filter.status);
  const { data, error } = await query;
  if (error) throw new AppError("internal", error.message);
  return (data ?? []) as MarketingCrmEntry[];
}

export async function updateCrmStatus(
  db: Db,
  params: { sessionId: string; id: string; status: CrmStatus },
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("marketing_crm")
    .update({ status: params.status, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("session_id", params.sessionId)
    .select("id")
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("CRM entry not found for this campaign");
  return { id: data.id as string };
}

/** A CRM entry to add or refresh; `undefined` fields are left untouched on an existing row. */
export interface CrmEntryInput {
  type: CrmEntryType;
  platform: MarketingPlatform;
  handle: string;
  name?: string;
  followers?: number;
  engagement_rate?: number;
  niche_match_score?: number;
  relevance_reasoning?: string;
  offer_amount?: number;
  status?: CrmStatus;
}

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "");
}

const entryKey = (platform: string, handle: string) =>
  `${platform}:${normalizeHandle(handle).toLowerCase()}`;

/**
 * Prepare discovered candidates for the CRM: keep only the campaign's
 * platforms, normalise handles, drop duplicates (first wins) and default a
 * creator's offer to the middle of the configured range.
 */
export function prepareDiscoveredEntries(
  entries: DiscoveredCrmEntry[],
  options: { platforms: MarketingPlatform[]; offerMin?: number; offerMax?: number },
): CrmEntryInput[] {
  const offerDefault =
    options.offerMin != null && options.offerMax != null
      ? Math.round((options.offerMin + options.offerMax) / 2)
      : undefined;
  const seen = new Set<string>();
  const result: CrmEntryInput[] = [];
  for (const entry of entries) {
    if (!options.platforms.includes(entry.platform)) continue;
    const handle = normalizeHandle(entry.handle);
    if (!handle) continue;
    const key = entryKey(entry.platform, handle);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      type: entry.type,
      platform: entry.platform,
      handle,
      name: entry.name,
      followers: entry.followers,
      engagement_rate: entry.engagement_rate,
      niche_match_score: entry.niche_match_score,
      relevance_reasoning: entry.relevance_reasoning,
      offer_amount: entry.offer_amount ?? (entry.type === "creator" ? offerDefault : undefined),
    });
  }
  return result;
}

function definedFields(entry: CrmEntryInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    name: entry.name,
    followers: entry.followers,
    engagement_rate: entry.engagement_rate,
    niche_match_score: entry.niche_match_score,
    relevance_reasoning: entry.relevance_reasoning,
    offer_amount: entry.offer_amount,
    status: entry.status,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
}

export interface UpsertResult {
  created: string[];
  updated: string[];
}

/**
 * Add new entries and refresh existing ones (matched by platform + handle,
 * case-insensitively) for the campaign. Returns the handles touched.
 */
export async function upsertCrmEntries(
  db: Db,
  sessionId: string,
  entries: CrmEntryInput[],
): Promise<UpsertResult & { ids: Record<string, string> }> {
  const result = {
    created: [] as string[],
    updated: [] as string[],
    ids: {} as Record<string, string>,
  };
  if (entries.length === 0) return result;

  const { data: existingRows, error } = await db
    .from("marketing_crm")
    .select("id, platform, handle")
    .eq("session_id", sessionId)
    .in("platform", [...new Set(entries.map((e) => e.platform))]);
  if (error) throw new AppError("internal", error.message);
  const existing = new Map(
    (existingRows ?? []).map((r) => [
      entryKey(r.platform as string, r.handle as string),
      r.id as string,
    ]),
  );

  const now = new Date().toISOString();
  const inserts: Record<string, unknown>[] = [];
  for (const entry of entries) {
    const key = entryKey(entry.platform, entry.handle);
    const id = existing.get(key);
    if (id) {
      const { error: upErr } = await db
        .from("marketing_crm")
        .update({ ...definedFields(entry), updated_at: now })
        .eq("id", id)
        .eq("session_id", sessionId);
      if (upErr) throw new AppError("internal", upErr.message);
      result.updated.push(entry.handle);
      result.ids[key] = id;
    } else {
      inserts.push({
        session_id: sessionId,
        type: entry.type,
        platform: entry.platform,
        handle: normalizeHandle(entry.handle),
        name: entry.name ?? null,
        followers: entry.followers ?? null,
        engagement_rate: entry.engagement_rate ?? null,
        niche_match_score: entry.niche_match_score ?? null,
        relevance_reasoning: entry.relevance_reasoning ?? null,
        offer_amount: entry.offer_amount ?? null,
        status: entry.status ?? "identified",
      });
    }
  }

  if (inserts.length) {
    const { data, error: insErr } = await db
      .from("marketing_crm")
      .insert(inserts)
      .select("id, platform, handle");
    if (insErr) throw new AppError("internal", insErr.message);
    for (const row of data ?? []) {
      result.created.push(row.handle as string);
      result.ids[entryKey(row.platform as string, row.handle as string)] = row.id as string;
    }
  }
  return result;
}

/** Add or refresh a single entry; returns its id and whether it already existed. */
export async function upsertCrmEntry(
  db: Db,
  sessionId: string,
  entry: CrmEntryInput,
): Promise<{ id: string; updated: boolean }> {
  const result = await upsertCrmEntries(db, sessionId, [
    { ...entry, handle: normalizeHandle(entry.handle) },
  ]);
  return {
    id: result.ids[entryKey(entry.platform, entry.handle)],
    updated: result.updated.length > 0,
  };
}
