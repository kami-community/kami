import { createHmac, randomBytes } from "node:crypto";
import { AppError, forbidden, notConfigured, upstreamFailed } from "@/lib/http/errors";
import type { BoostReceipt, BoostRequest, PostBoostProvider } from "@/lib/ports/ads";

/**
 * X Ads API (https://ads-api.x.com, version 12) adapter.
 *
 * Authentication is OAuth 1.0a user context (HMAC-SHA1, RFC 5849): an app
 * approved for Ads API access plus access tokens of an X user who can manage
 * the ads account. Every endpoint takes its parameters on the query string.
 *
 * Boost flow (docs.x.com/x-ads-api/campaign-management/reference):
 *   funding instrument → campaign (PAUSED) → line item (ENGAGEMENTS, AUTO bid)
 *   → promoted_tweets → campaign ACTIVE.
 * Spend cannot start before the last step, and a partial failure deletes the campaign.
 */

export const X_ADS_API = "https://ads-api.x.com/12";

// --- OAuth 1.0a (RFC 5849) ----------------------------------------------------

/** RFC 5849 §3.6 / RFC 3986 percent-encoding: only ALPHA, DIGIT, "-", ".", "_", "~" stay as-is. */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** RFC 5849 §3.4.1.3.2: encode, sort by name then value (byte order), join with "&". */
export function normalizeParameters(params: [string, string][]): string {
  const encoded = params.map(([k, v]) => [percentEncode(k), percentEncode(v)] as const);
  encoded.sort(([ak, av], [bk, bv]) =>
    ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0,
  );
  return encoded.map(([k, v]) => `${k}=${v}`).join("&");
}

/** RFC 5849 §3.4.1: METHOD & encoded base URI & encoded normalized parameters. */
export function signatureBaseString(
  method: string,
  baseUrl: string,
  params: [string, string][],
): string {
  return [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(normalizeParameters(params)),
  ].join("&");
}

/** RFC 5849 §3.4.2: base64(HMAC-SHA1(consumerSecret&tokenSecret, baseString)). */
export function hmacSha1Signature(
  baseString: string,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const key = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return createHmac("sha1", key).update(baseString).digest("base64");
}

export interface OAuth1Credentials {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
}

/**
 * Build the `Authorization: OAuth …` header for a request. `params` are the
 * query-string (and form-body) parameters, as raw (unencoded) values.
 */
export function oauth1Header(
  creds: OAuth1Credentials,
  request: { method: string; url: string; params: [string, string][] },
  fixed: { nonce?: string; timestamp?: string } = {},
): string {
  const oauth: [string, string][] = [
    ["oauth_consumer_key", creds.consumerKey],
    ["oauth_nonce", fixed.nonce ?? randomBytes(16).toString("hex")],
    ["oauth_signature_method", "HMAC-SHA1"],
    ["oauth_timestamp", fixed.timestamp ?? String(Math.floor(Date.now() / 1000))],
    ["oauth_token", creds.token],
    ["oauth_version", "1.0"],
  ];
  const base = signatureBaseString(request.method, request.url, [...request.params, ...oauth]);
  const signature = hmacSha1Signature(base, creds.consumerSecret, creds.tokenSecret);
  const fields = [...oauth, ["oauth_signature", signature] as [string, string]];
  return `OAuth ${fields.map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`).join(", ")}`;
}

// --- Configuration --------------------------------------------------------------

export interface XAdsConfig extends OAuth1Credentials {
  accountId: string;
  /** Optional: pin a funding instrument; otherwise the first active, fundable one is used. */
  fundingInstrumentId?: string;
}

/** The settings this adapter reads. Pass `env()` (or any object with these keys). */
export interface XAdsSettings {
  X_ADS_CONSUMER_KEY?: string;
  X_ADS_CONSUMER_SECRET?: string;
  X_ADS_ACCESS_TOKEN?: string;
  X_ADS_ACCESS_TOKEN_SECRET?: string;
  X_ADS_ACCOUNT_ID?: string;
  X_ADS_FUNDING_INSTRUMENT_ID?: string;
}

const REQUIRED_SETTINGS = [
  "X_ADS_CONSUMER_KEY",
  "X_ADS_CONSUMER_SECRET",
  "X_ADS_ACCESS_TOKEN",
  "X_ADS_ACCESS_TOKEN_SECRET",
  "X_ADS_ACCOUNT_ID",
] as const;

/** Typed config from settings, or null when any required value is missing. */
export function readXAdsConfig(settings: XAdsSettings): XAdsConfig | null {
  const value = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  const consumerKey = value(settings.X_ADS_CONSUMER_KEY);
  const consumerSecret = value(settings.X_ADS_CONSUMER_SECRET);
  const token = value(settings.X_ADS_ACCESS_TOKEN);
  const tokenSecret = value(settings.X_ADS_ACCESS_TOKEN_SECRET);
  const accountId = value(settings.X_ADS_ACCOUNT_ID);
  if (!consumerKey || !consumerSecret || !token || !tokenSecret || !accountId) return null;
  return {
    consumerKey,
    consumerSecret,
    token,
    tokenSecret,
    accountId,
    fundingInstrumentId: value(settings.X_ADS_FUNDING_INSTRUMENT_ID),
  };
}

export const X_ADS_NOT_CONFIGURED = `Paid boosts need X Ads API access (${REQUIRED_SETTINGS.join(", ")})`;

// --- Client -----------------------------------------------------------------------

interface AdsErrorBody {
  errors?: { code?: string; message?: string; parameter?: string }[];
}

interface FundingInstrument {
  id: string;
  currency: string;
  entity_status: string;
  able_to_fund?: boolean;
  deleted?: boolean;
}

/** Whole currency units → X "local micro" (USD 5.50 → 5500000). */
export function toLocalMicro(amount: number): string {
  return String(Math.round(amount * 1_000_000));
}

export function createXAdsBoostProvider(
  config: XAdsConfig,
  fetchImpl: typeof fetch = fetch,
): PostBoostProvider {
  const accountPath = `${X_ADS_API}/accounts/${encodeURIComponent(config.accountId)}`;

  async function call<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const url = `${accountPath}${path}`;
    const pairs = Object.entries(params);
    const qs = pairs.map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`).join("&");
    let res: Response;
    try {
      res = await fetchImpl(qs ? `${url}?${qs}` : url, {
        method,
        headers: { Authorization: oauth1Header(config, { method, url, params: pairs }) },
      });
    } catch (err) {
      throw upstreamFailed(
        `Could not reach the X Ads API: ${err instanceof Error ? err.message : err}`,
      );
    }
    const json = (await res.json().catch(() => ({}))) as T & AdsErrorBody;
    if (!res.ok) {
      const first = json.errors?.[0];
      const message = first?.message ?? `HTTP ${res.status}`;
      const details = {
        provider_status: res.status,
        provider_code: first?.code ?? null,
        provider_parameter: first?.parameter ?? null,
      };
      if (res.status === 401) {
        throw new AppError("unauthorized", `X Ads rejected the credentials: ${message}`, details);
      }
      if (res.status === 403) {
        throw forbidden(
          `X Ads refused the request: ${message}. Check Ads API access for the app and that the token's user can manage ads account ${config.accountId}.`,
          details,
        );
      }
      throw upstreamFailed(`X Ads API error: ${message}`, details);
    }
    return json;
  }

  async function fundingInstrument(): Promise<FundingInstrument> {
    if (config.fundingInstrumentId) {
      const { data } = await call<{ data?: FundingInstrument }>(
        "GET",
        `/funding_instruments/${encodeURIComponent(config.fundingInstrumentId)}`,
      );
      if (!data || data.deleted || data.entity_status !== "ACTIVE" || data.able_to_fund === false) {
        throw notConfigured(
          `X Ads funding instrument ${config.fundingInstrumentId} is not active or cannot fund campaigns`,
        );
      }
      return data;
    }
    const { data } = await call<{ data?: FundingInstrument[] }>("GET", "/funding_instruments", {
      count: "200",
    });
    const usable = (data ?? []).find(
      (fi) => !fi.deleted && fi.entity_status === "ACTIVE" && fi.able_to_fund !== false,
    );
    if (!usable) {
      throw notConfigured(
        `X Ads account ${config.accountId} has no active funding instrument — add a payment method in ads.x.com`,
      );
    }
    return usable;
  }

  async function assertPromotable(userId: string): Promise<void> {
    const { data } = await call<{
      data?: { user_id: string; promotable_user_type?: string; deleted?: boolean }[];
    }>("GET", "/promotable_users", { count: "1000" });
    const match = (data ?? []).find((u) => u.user_id === userId && !u.deleted);
    if (!match || match.promotable_user_type === "RETWEETS_ONLY") {
      throw forbidden(
        `The connected X account is not a promotable user of ads account ${config.accountId} — add it in ads.x.com first`,
      );
    }
  }

  return {
    id: "x_ads",

    async boostPost(request: BoostRequest): Promise<BoostReceipt> {
      const fi = await fundingInstrument();
      await assertPromotable(request.authorUserId);

      const start = new Date();
      const end = new Date(start.getTime() + request.durationDays * 86_400_000);
      const total = toLocalMicro(request.totalBudget);
      const daily = toLocalMicro(
        Math.min(
          request.totalBudget,
          Math.ceil((request.totalBudget / request.durationDays) * 100) / 100,
        ),
      );

      // 1. Campaign, paused: nothing can spend until every entity exists.
      const campaign = await call<{ data?: { id?: string } }>("POST", "/campaigns", {
        funding_instrument_id: fi.id,
        name: request.name.slice(0, 255),
        entity_status: "PAUSED",
        budget_optimization: "LINE_ITEM",
        total_budget_amount_local_micro: total,
        daily_budget_amount_local_micro: daily,
      });
      const campaignId = campaign.data?.id;
      if (!campaignId) throw upstreamFailed("X Ads created a campaign but returned no id");

      let lineItemId: string | undefined;
      try {
        // 2. Line item: engagement objective, automatic bidding inside the founder's budget.
        const lineItem = await call<{ data?: { id?: string } }>("POST", "/line_items", {
          campaign_id: campaignId,
          objective: "ENGAGEMENTS",
          product_type: "PROMOTED_TWEETS",
          placements: "ALL_ON_TWITTER",
          bid_strategy: "AUTO",
          entity_status: "ACTIVE",
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          total_budget_amount_local_micro: total,
          name: request.name.slice(0, 255),
        });
        lineItemId = lineItem.data?.id;
        if (!lineItemId) throw upstreamFailed("X Ads created a line item but returned no id");

        // 3. Attach the post.
        const promoted = await call<{ data?: { id?: string; tweet_id?: string }[] }>(
          "POST",
          "/promoted_tweets",
          { line_item_id: lineItemId, tweet_ids: request.postId },
        );
        const promotedPostId = promoted.data?.[0]?.id;
        if (!promotedPostId) throw upstreamFailed("X Ads did not return a promoted post id");

        // 4. Go live.
        await call("PUT", `/campaigns/${encodeURIComponent(campaignId)}`, {
          entity_status: "ACTIVE",
        });

        return {
          provider: "x_ads",
          adsAccountId: config.accountId,
          fundingInstrumentId: fi.id,
          currency: fi.currency,
          campaignId,
          lineItemId,
          promotedPostId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        };
      } catch (err) {
        // Remove the half-built (still paused) campaign so nothing can spend.
        let cleanedUp = false;
        let cleanupError: string | null = null;
        try {
          await call("DELETE", `/campaigns/${encodeURIComponent(campaignId)}`);
          cleanedUp = true;
        } catch (cleanup) {
          cleanupError = cleanup instanceof Error ? cleanup.message : "delete failed";
        }
        const base =
          err instanceof AppError
            ? err
            : upstreamFailed(`X Ads boost failed: ${err instanceof Error ? err.message : err}`);
        throw new AppError(base.code, base.message, {
          ...(base.details ?? {}),
          x_campaign_id: campaignId,
          x_line_item_id: lineItemId ?? null,
          campaign_deleted: cleanedUp,
          cleanup_error: cleanupError,
        });
      }
    },
  };
}
