import { getCampaign } from "@/lib/campaigns/sessions";
import type { Db } from "@/lib/db/client";
import { icpFromSegments, normalizeSegments, type SalesSegment } from "@/lib/domain/segments";
import { badRequest } from "@/lib/http/errors";
import { validateSegmentsForConfirm } from "@/lib/salesSegmentGates";
import { deriveSalesSegments } from "@/lib/salesSegments";
import type { Row } from "./rows";
import { audit, dbError, loadSalesCampaign, now } from "./shared";

/**
 * ICP segments: who the Sales campaign targets. Drafted by the
 * sales-strategist agent from the dossier, edited and confirmed by the founder.
 * Discovery is blocked until segments are confirmed.
 */

export interface SegmentsView {
  segments: SalesSegment[];
  confirmed_at: string | null;
  source: string;
}

function storedSegments(campaign: Row): SalesSegment[] | null {
  return Array.isArray(campaign.segments) && campaign.segments.length
    ? (campaign.segments as SalesSegment[])
    : null;
}

/** Run the strategist (or dossier fallback) and store the result as an unconfirmed draft. */
async function deriveAndStore(db: Db, sessionId: string, campaignId: string): Promise<SegmentsView> {
  const { session, dossier } = await getCampaign(db, sessionId);
  const derived = await deriveSalesSegments({
    domain: session.canonical_domain || session.domain,
    dossier,
    goals: session.goals,
    kamiSessionId: sessionId,
  });

  const { error } = await db
    .from("sales_campaigns")
    .update({ segments: derived.segments, segments_confirmed_at: null, updated_at: now() })
    .eq("id", campaignId)
    .eq("session_id", sessionId);
  if (error) throw dbError(error, "could not save the drafted segments");

  return { segments: derived.segments, confirmed_at: null, source: derived.source };
}

/**
 * Confirmed segments if any, else the stored draft. Derives a draft only when
 * none exists (or `refresh` is set) so remounting the UI never re-runs Hermes.
 */
export async function getSegments(
  db: Db,
  sessionId: string,
  refresh: boolean,
): Promise<SegmentsView> {
  const campaign = await loadSalesCampaign(db, sessionId);
  const stored = storedSegments(campaign);
  const confirmedAt = (campaign.segments_confirmed_at as string | null) ?? null;

  if (stored && confirmedAt) return { segments: stored, confirmed_at: confirmedAt, source: "confirmed" };
  if (stored && !refresh) return { segments: stored, confirmed_at: null, source: "draft" };
  return deriveAndStore(db, sessionId, campaign.id as string);
}

/** Re-draft segments from the dossier, discarding any confirmation. */
export async function rederiveSegments(db: Db, sessionId: string): Promise<SegmentsView> {
  const campaign = await loadSalesCampaign(db, sessionId);
  return deriveAndStore(db, sessionId, campaign.id as string);
}

/** Founder confirms (possibly edited) segments; the ICP titles/industries follow them. */
export async function confirmSegments(db: Db, sessionId: string, raw: unknown[]) {
  const campaign = await loadSalesCampaign(db, sessionId);
  const segments = normalizeSegments({ segments: raw });
  const problem = validateSegmentsForConfirm(segments);
  if (problem) throw badRequest(problem);

  const confirmedAt = now();
  const icpPatch = icpFromSegments(segments);
  const currentIcp = campaign.icp && typeof campaign.icp === "object" ? campaign.icp : {};

  const { data, error } = await db
    .from("sales_campaigns")
    .update({
      segments,
      segments_confirmed_at: confirmedAt,
      icp: { ...currentIcp, titles: icpPatch.titles, industries: icpPatch.industries },
      updated_at: confirmedAt,
    })
    .eq("id", campaign.id)
    .eq("session_id", sessionId)
    .select("id")
    .single();
  if (error) throw dbError(error, "could not confirm segments");

  await audit(db, {
    sessionId,
    actor: "user",
    action: "segments_confirmed",
    entityType: "sales_campaign",
    entityId: data.id,
    payload: { segment_count: segments.length, keys: segments.map((s) => s.key) },
  });

  return {
    confirmed: true as const,
    segments,
    confirmed_at: confirmedAt,
    campaign_id: data.id as string,
  };
}
