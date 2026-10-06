import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";
import {
  createXAdsBoostProvider,
  hmacSha1Signature,
  normalizeParameters,
  oauth1Header,
  percentEncode,
  readXAdsConfig,
  signatureBaseString,
  toLocalMicro,
  X_ADS_API,
} from "./xAds";

/**
 * Vectors from X's "Creating a signature" guide
 * (docs.x.com/fundamentals/authentication/oauth-1-0a/creating-a-signature)
 * and RFC 5849 §3.4.1.3.2.
 */
// Public test vector from X's OAuth 1.0a "Creating a signature" docs (allow-listed in .gitleaksignore).
const X_EXAMPLE = {
  url: "https://api.x.com/1.1/statuses/update.json",
  params: [
    ["status", "Hello Ladies + Gentlemen, a signed OAuth request!"],
    ["include_entities", "true"],
  ] as [string, string][],
  creds: {
    consumerKey: "xvz1evFS4wEEPTGEFPHBog",
    consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
    token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
    tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
  },
  nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
  timestamp: "1318622958",
  baseString:
    "POST&https%3A%2F%2Fapi.x.com%2F1.1%2Fstatuses%2Fupdate.json&include_entities%3Dtrue%26oauth_consumer_key%3Dxvz1evFS4wEEPTGEFPHBog%26oauth_nonce%3DkYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1318622958%26oauth_token%3D370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb%26oauth_version%3D1.0%26status%3DHello%2520Ladies%2520%252B%2520Gentlemen%252C%2520a%2520signed%2520OAuth%2520request%2521",
  // Documented HMAC output bytes: 2E CF 77 84 98 99 6D 0D DA 90 5D C7 17 7C 75 07 3F 3F CD 4E
  signature: Buffer.from("2ecf778498996d0dda905dc7177c75073f3fcd4e", "hex").toString("base64"),
};

describe("OAuth 1.0a signing", () => {
  it("percent-encodes per RFC 3986 unreserved set", () => {
    expect(percentEncode("Ladies + Gentlemen")).toBe("Ladies%20%2B%20Gentlemen");
    expect(percentEncode("An encoded string!")).toBe("An%20encoded%20string%21");
    expect(percentEncode("Dogs, Cats & Mice")).toBe("Dogs%2C%20Cats%20%26%20Mice");
    expect(percentEncode("☃")).toBe("%E2%98%83");
    expect(percentEncode("a-b.c_d~e*'()")).toBe("a-b.c_d~e%2A%27%28%29");
  });

  it("normalizes parameters as in RFC 5849 §3.4.1.3.2 (duplicate names sorted by value)", () => {
    const params: [string, string][] = [
      ["b5", "=%3D"],
      ["a3", "a"],
      ["c@", ""],
      ["a2", "r b"],
      ["oauth_consumer_key", "9djdj82h48djs9d2"],
      ["oauth_token", "kkk9d7dh3k39sjv7"],
      ["oauth_signature_method", "HMAC-SHA1"],
      ["oauth_timestamp", "137131201"],
      ["oauth_nonce", "7d8f3e4a"],
      ["c2", ""],
      ["a3", "2 q"],
    ];
    expect(normalizeParameters(params)).toBe(
      "a2=r%20b&a3=2%20q&a3=a&b5=%3D%253D&c%40=&c2=&oauth_consumer_key=9djdj82h48djs9d2&oauth_nonce=7d8f3e4a&oauth_signature_method=HMAC-SHA1&oauth_timestamp=137131201&oauth_token=kkk9d7dh3k39sjv7",
    );
  });

  it("builds X's documented signature base string", () => {
    const params: [string, string][] = [
      ...X_EXAMPLE.params,
      ["oauth_consumer_key", X_EXAMPLE.creds.consumerKey],
      ["oauth_nonce", X_EXAMPLE.nonce],
      ["oauth_signature_method", "HMAC-SHA1"],
      ["oauth_timestamp", X_EXAMPLE.timestamp],
      ["oauth_token", X_EXAMPLE.creds.token],
      ["oauth_version", "1.0"],
    ];
    expect(signatureBaseString("post", X_EXAMPLE.url, params)).toBe(X_EXAMPLE.baseString);
  });

  it("produces X's documented HMAC-SHA1 signature", () => {
    expect(
      hmacSha1Signature(
        X_EXAMPLE.baseString,
        X_EXAMPLE.creds.consumerSecret,
        X_EXAMPLE.creds.tokenSecret,
      ),
    ).toBe(X_EXAMPLE.signature);
    expect(X_EXAMPLE.signature).toBe("Ls93hJiZbQ3akF3HF3x1Bz8/zU4=");
  });

  it("emits a complete Authorization header", () => {
    const header = oauth1Header(
      X_EXAMPLE.creds,
      { method: "POST", url: X_EXAMPLE.url, params: X_EXAMPLE.params },
      { nonce: X_EXAMPLE.nonce, timestamp: X_EXAMPLE.timestamp },
    );
    expect(header).toBe(
      'OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog", oauth_nonce="kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1318622958", oauth_token="370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", oauth_version="1.0", oauth_signature="Ls93hJiZbQ3akF3HF3x1Bz8%2FzU4%3D"',
    );
  });
});

describe("readXAdsConfig", () => {
  it("is null unless every required setting is present", () => {
    expect(readXAdsConfig({ X_ADS_ACCESS_TOKEN: "t", X_ADS_ACCOUNT_ID: "a" })).toBeNull();
    expect(
      readXAdsConfig({
        X_ADS_CONSUMER_KEY: "ck",
        X_ADS_CONSUMER_SECRET: "cs",
        X_ADS_ACCESS_TOKEN: "t",
        X_ADS_ACCESS_TOKEN_SECRET: "ts",
        X_ADS_ACCOUNT_ID: "acc",
      }),
    ).toMatchObject({ accountId: "acc", fundingInstrumentId: undefined });
  });

  it("converts currency to local micro", () => {
    expect(toLocalMicro(5.5)).toBe("5500000");
    expect(toLocalMicro(37.5)).toBe("37500000");
  });
});

const CONFIG = {
  consumerKey: "ck",
  consumerSecret: "cs",
  token: "tok",
  tokenSecret: "ts",
  accountId: "18ce54d4x5t",
};

type Handler = (method: string, url: URL) => { status?: number; body: unknown };

function mockFetch(handler: Handler) {
  const calls: { method: string; url: URL; auth: string }[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({ method, url, auth: String(new Headers(init?.headers).get("Authorization")) });
    const { status = 200, body } = handler(method, url);
    return new Response(JSON.stringify(body), { status });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const base = `${X_ADS_API}/accounts/${CONFIG.accountId}`;

function happyHandler(overrides: Partial<Record<string, Handler>> = {}): Handler {
  return (method, url) => {
    const path = url.pathname.replace(new URL(base).pathname, "");
    const key = `${method} ${path}`;
    if (overrides[key]) return overrides[key]!(method, url);
    switch (key) {
      case "GET /funding_instruments":
        return {
          body: {
            data: [
              { id: "dead", currency: "USD", entity_status: "PAUSED", able_to_fund: true },
              { id: "lygyi", currency: "USD", entity_status: "ACTIVE", able_to_fund: true },
            ],
          },
        };
      case "GET /promotable_users":
        return { body: { data: [{ user_id: "42", promotable_user_type: "FULL" }] } };
      case "POST /campaigns":
        return { body: { data: { id: "hwtbm" } } };
      case "POST /line_items":
        return { body: { data: { id: "8v7jo" } } };
      case "POST /promoted_tweets":
        return { body: { data: [{ id: "1e8i2k", tweet_id: "999" }] } };
      case "PUT /campaigns/hwtbm":
        return { body: { data: { id: "hwtbm", entity_status: "ACTIVE" } } };
      case "DELETE /campaigns/hwtbm":
        return { body: { data: { id: "hwtbm", deleted: true } } };
      default:
        return { status: 404, body: { errors: [{ code: "NOT_FOUND", message: key }] } };
    }
  };
}

const REQUEST = {
  postId: "999",
  authorUserId: "42",
  totalBudget: 50,
  durationDays: 7,
  name: "Kami boost",
};

describe("createXAdsBoostProvider", () => {
  it("creates a paused campaign, line item and promoted post, then activates", async () => {
    const { impl, calls } = mockFetch(happyHandler());
    const receipt = await createXAdsBoostProvider(CONFIG, impl).boostPost(REQUEST);

    expect(receipt).toMatchObject({
      provider: "x_ads",
      fundingInstrumentId: "lygyi",
      currency: "USD",
      campaignId: "hwtbm",
      lineItemId: "8v7jo",
      promotedPostId: "1e8i2k",
    });
    expect(calls.map((c) => `${c.method} ${c.url.pathname.split("/").slice(4).join("/")}`)).toEqual(
      [
        "GET funding_instruments",
        "GET promotable_users",
        "POST campaigns",
        "POST line_items",
        "POST promoted_tweets",
        "PUT campaigns/hwtbm",
      ],
    );
    const campaign = calls[2].url.searchParams;
    expect(campaign.get("entity_status")).toBe("PAUSED");
    expect(campaign.get("funding_instrument_id")).toBe("lygyi");
    expect(campaign.get("total_budget_amount_local_micro")).toBe("50000000");
    expect(campaign.get("daily_budget_amount_local_micro")).toBe("7150000");
    const lineItem = calls[3].url.searchParams;
    expect(lineItem.get("objective")).toBe("ENGAGEMENTS");
    expect(lineItem.get("bid_strategy")).toBe("AUTO");
    expect(lineItem.get("product_type")).toBe("PROMOTED_TWEETS");
    expect(lineItem.get("end_time")).toBeTruthy();
    expect(calls[4].url.searchParams.get("tweet_ids")).toBe("999");
    expect(calls[5].url.searchParams.get("entity_status")).toBe("ACTIVE");
    for (const c of calls) expect(c.auth).toMatch(/^OAuth oauth_consumer_key="ck", /);
  });

  it("refuses to spend when the author is not a promotable user", async () => {
    const { impl, calls } = mockFetch(
      happyHandler({ "GET /promotable_users": () => ({ body: { data: [] } }) }),
    );
    await expect(createXAdsBoostProvider(CONFIG, impl).boostPost(REQUEST)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("deletes the paused campaign when a later step fails", async () => {
    const { impl, calls } = mockFetch(
      happyHandler({
        "POST /promoted_tweets": () => ({
          status: 400,
          body: { errors: [{ code: "INVALID_PARAMETER", message: "tweet not promotable" }] },
        }),
      }),
    );
    const err = await createXAdsBoostProvider(CONFIG, impl)
      .boostPost(REQUEST)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("upstream_failed");
    expect((err as AppError).details).toMatchObject({
      x_campaign_id: "hwtbm",
      x_line_item_id: "8v7jo",
      campaign_deleted: true,
      provider_code: "INVALID_PARAMETER",
    });
    expect(calls.at(-1)?.method).toBe("DELETE");
  });
});
