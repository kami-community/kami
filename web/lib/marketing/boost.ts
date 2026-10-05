import { z } from "zod";
import { getMe, getPost } from "@/lib/adapters/x/api";
import { X_ADS_NOT_CONFIGURED } from "@/lib/adapters/xAds";
import { boostProvider } from "@/lib/providers";
import { env } from "@/lib/config/env";
import { requireConnection } from "@/lib/connections/service";
import type { Db } from "@/lib/db/client";
import { AppError, conflict, forbidden, notConfigured } from "@/lib/http/errors";
import { ids } from "@/lib/http/route";
import type { BoostCampaign } from "@/lib/marketingTypes";
import { assertNotPaused } from "@/lib/outbound/policy";
import type { PostBoostProvider } from "@/lib/ports/ads";

/**
 * Paid boosts of the founder's own X posts. Real spend, so the gates are strict:
 * campaign not paused → Ads API configured → post authored by the connected
 * account → claim a `pending` row (one live boost per post) → X Ads calls →
 * `active` with campaign/line item ids, or `failed` with the reason.
 */

/** Per-boost spend cap, in the funding instrument's currency. */
export const MAX_BOOST_BUDGET = 500;
export const MIN_BOOST_BUDGET = 5;
export const MAX_BOOST_DAYS = 30;

export const CreateBoostInput = z.object({
  session_id: ids.sessionId,
  post_id: z.string().regex(/^\d{1,25}$/, "post_id must be an X post id"),
  budget: z
    .number()
    .finite()
    .min(MIN_BOOST_BUDGET, `budget must be at least ${MIN_BOOST_BUDGET}`)
    .max(MAX_BOOST_BUDGET, `budget is capped at ${MAX_BOOST_BUDGET} per boost`)
    .refine((v) => Math.round(v * 100) === v * 100, "budget can have at most 2 decimals"),
  duration_days: z.number().int().min(1).max(MAX_BOOST_DAYS).default(7),
});
export type CreateBoostInput = z.infer<typeof CreateBoostInput>;

export function boostsConfigured(): boolean {
  return boostProvider() !== null;
}

const UNIQUE_VIOLATION = "23505";

export async function listBoosts(db: Db, sessionId: string): Promise<BoostCampaign[]> {
  const { data, error } = await db
    .from("boost_campaigns")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new AppError("internal", error.message);
  return (data ?? []) as BoostCampaign[];
}

export async function createBoost(
  db: Db,
  input: CreateBoostInput,
  provider: PostBoostProvider | null = boostProvider(),
): Promise<BoostCampaign> {
  const sessionId = input.session_id;
  await assertNotPaused(db, sessionId, "marketing");
  if (!provider) throw notConfigured(X_ADS_NOT_CONFIGURED);

  // The post must be authored by this campaign's connected X account.
  const account = await requireConnection(db, sessionId, "x");
  const post = await getPost(account.accessToken, input.post_id);
  const ownerId = account.externalUserId ?? (await getMe(account.accessToken)).id;
  if (post.author_id !== ownerId) {
    throw forbidden(`Only posts from the connected account @${account.handle} can be boosted`);
  }

  // Claim before any paid call: the partial unique index allows one pending/active row per post.
  const inserted = await db
    .from("boost_campaigns")
    .insert({
      session_id: sessionId,
      post_id: post.id,
      post_text: post.text,
      budget: input.budget,
      duration_days: input.duration_days,
      status: "pending",
      provider: provider.id,
    })
    .select("*")
    .single();
  if (inserted.error) {
    if (inserted.error.code === UNIQUE_VIOLATION) {
      const { data: existing } = await db
        .from("boost_campaigns")
        .select("*")
        .eq("session_id", sessionId)
        .eq("post_id", post.id)
        .in("status", ["pending", "active"])
        .maybeSingle();
      throw conflict(
        existing?.status === "active"
          ? "this post is already boosted"
          : "a boost for this post is already being created — check ads.x.com before retrying",
        { boost: existing ?? null },
      );
    }
    throw new AppError("internal", inserted.error.message);
  }
  const claim = inserted.data as BoostCampaign;

  try {
    const receipt = await provider.boostPost({
      postId: post.id,
      authorUserId: post.author_id,
      totalBudget: input.budget,
      durationDays: input.duration_days,
      name: `Kami boost · @${account.handle} · ${post.id}`,
    });
    const { data, error } = await db
      .from("boost_campaigns")
      .update({
        status: "active",
        currency: receipt.currency,
        ads_account_id: receipt.adsAccountId,
        funding_instrument_id: receipt.fundingInstrumentId,
        x_campaign_id: receipt.campaignId,
        x_line_item_id: receipt.lineItemId,
        x_promoted_tweet_id: receipt.promotedPostId,
        starts_at: receipt.startTime,
        ends_at: receipt.endTime,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", claim.id)
      .select("*")
      .single();
    if (error) {
      // The boost is live on X; surface loudly so the founder does not create a second one.
      throw new AppError("internal", `boost is live, but recording it failed: ${error.message}`, {
        sent: true,
        x_campaign_id: receipt.campaignId,
      });
    }
    return data as BoostCampaign;
  } catch (err) {
    if (err instanceof AppError && err.details?.sent) throw err;
    const details = err instanceof AppError ? (err.details ?? {}) : {};
    const campaignId = typeof details.x_campaign_id === "string" ? details.x_campaign_id : null;
    const stranded = campaignId && !details.campaign_deleted ? campaignId : null;
    const message = err instanceof Error ? err.message : "boost failed";
    const { error } = await db
      .from("boost_campaigns")
      .update({
        status: "failed",
        // Kept only when X did not confirm deleting the (paused) campaign.
        x_campaign_id: stranded,
        error: (stranded
          ? `${message} (paused campaign ${stranded} could not be deleted — remove it in ads.x.com)`
          : message
        ).slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", claim.id);
    if (error) console.error("[boost] could not mark boost failed", claim.id, error.message);
    throw err;
  }
}
