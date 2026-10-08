import { assertDossierConfirmed } from "@/lib/campaigns/sessions";
import type { Db } from "@/lib/db/client";
import { AppError, notFound } from "@/lib/http/errors";
import type { MarketingConfig, MarketingPlatform, OutreachGoal } from "@/lib/marketingTypes";

/** Advanced Marketing (X / Instagram CRM and cold DMs) configuration for one campaign. */

export const MARKETING_PLATFORMS = [
  "x",
  "instagram",
] as const satisfies readonly MarketingPlatform[];
export const OUTREACH_GOALS = [
  "drive_signups",
  "book_demo",
  "awareness",
] as const satisfies readonly OutreachGoal[];

export const DEFAULT_IG_MIN_FOLLOWERS = 5000;

function rowToConfig(row: Record<string, unknown>): MarketingConfig {
  const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    platforms: (row.platforms as MarketingPlatform[] | null) ?? [],
    x_boost_budget: num(row.x_boost_budget),
    x_outreach_goal: (row.x_outreach_goal as OutreachGoal | null) ?? undefined,
    ig_offer_min: num(row.ig_offer_min),
    ig_offer_max: num(row.ig_offer_max),
    ig_niche_keywords: (row.ig_niche_keywords as string[] | null) ?? undefined,
    ig_min_followers: num(row.ig_min_followers),
    tone: (row.tone as string[] | null) ?? undefined,
    autonomous_paused: Boolean(row.autonomous_paused),
  };
}

export async function getMarketingConfig(
  db: Db,
  sessionId: string,
): Promise<MarketingConfig | null> {
  const { data, error } = await db
    .from("marketing_config")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  return data ? rowToConfig(data) : null;
}

/** The campaign's Marketing config, or 404 when Marketing has not been set up. */
export async function requireMarketingConfig(db: Db, sessionId: string): Promise<MarketingConfig> {
  const config = await getMarketingConfig(db, sessionId);
  if (!config) throw notFound("set up Marketing for this campaign first");
  return config;
}

export interface MarketingSetupInput {
  sessionId: string;
  platforms: MarketingPlatform[];
  xBoostBudget?: number;
  xOutreachGoal?: OutreachGoal;
  igOfferMin?: number;
  igOfferMax?: number;
  igNicheKeywords?: string[];
  igMinFollowers?: number;
  tone?: string[];
}

/** Create or replace the Marketing config. Requires the confirmed dossier (domain-first). */
export async function saveMarketingConfig(
  db: Db,
  input: MarketingSetupInput,
): Promise<MarketingConfig> {
  await assertDossierConfirmed(db, input.sessionId);

  const { data, error } = await db
    .from("marketing_config")
    .upsert(
      {
        session_id: input.sessionId,
        platforms: input.platforms,
        x_boost_budget: input.xBoostBudget ?? null,
        x_outreach_goal: input.xOutreachGoal ?? null,
        ig_offer_min: input.igOfferMin ?? null,
        ig_offer_max: input.igOfferMax ?? null,
        ig_niche_keywords: input.igNicheKeywords ?? null,
        ig_min_followers: input.igMinFollowers ?? DEFAULT_IG_MIN_FOLLOWERS,
        tone: input.tone ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" },
    )
    .select("*")
    .single();
  if (error) throw new AppError("internal", error.message);
  return rowToConfig(data);
}

/** Pause or resume Marketing outreach (the area pause; the session kill switch is separate). */
export async function setMarketingPaused(
  db: Db,
  params: { sessionId: string; paused: boolean },
): Promise<MarketingConfig> {
  const { data, error } = await db
    .from("marketing_config")
    .update({ autonomous_paused: params.paused, updated_at: new Date().toISOString() })
    .eq("session_id", params.sessionId)
    .select("*")
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("set up Marketing for this campaign first");
  return rowToConfig(data);
}
