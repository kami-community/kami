import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, upstreamFailed } from "@/lib/http/errors";
import type { BoostReceipt, PostBoostProvider } from "@/lib/ports/ads";
import { fakeDb } from "@/lib/testing/fakeDb";

vi.mock("@/lib/connections/service", () => ({
  requireConnection: vi.fn(async () => ({
    platform: "x",
    handle: "founder",
    externalUserId: "42",
    accessToken: "user-token",
  })),
}));

const posts: Record<string, { id: string; text: string; author_id: string }> = {
  "111": { id: "111", text: "Our launch post", author_id: "42" },
  "222": { id: "222", text: "Someone else's post", author_id: "7" },
};
vi.mock("@/lib/adapters/x/api", () => ({
  getPost: vi.fn(async (_token: string, id: string) => posts[id]),
  getMe: vi.fn(async () => ({ id: "42", username: "founder" })),
}));

const { createBoost, CreateBoostInput, listBoosts } = await import("./boost");

const SESSION = "6f1c1d0e-2a51-4f6b-9a8e-0d1f0c9b7a11";

const RECEIPT: BoostReceipt = {
  provider: "x_ads",
  adsAccountId: "18ce54d4x5t",
  fundingInstrumentId: "lygyi",
  currency: "USD",
  campaignId: "hwtbm",
  lineItemId: "8v7jo",
  promotedPostId: "1e8i2k",
  startTime: "2026-10-06T00:00:00.000Z",
  endTime: "2026-10-13T00:00:00.000Z",
};

function provider(impl?: () => Promise<BoostReceipt>): PostBoostProvider & {
  boostPost: ReturnType<typeof vi.fn>;
} {
  return { id: "x_ads", boostPost: vi.fn(impl ?? (async () => RECEIPT)) };
}

/** Mirrors the partial unique index boost_campaigns_one_live_per_post_idx. */
function oneLivePerPost(
  table: string,
  row: Record<string, unknown>,
  rows: Record<string, unknown>[],
) {
  if (table !== "boost_campaigns") return null;
  const live = rows.some(
    (r) =>
      r.session_id === row.session_id &&
      r.post_id === row.post_id &&
      (r.status === "pending" || r.status === "active"),
  );
  return live ? "23505" : null;
}

function setup(opts: { paused?: boolean; marketingPaused?: boolean } = {}) {
  return fakeDb(
    {
      agent_sessions: [{ id: SESSION, paused: Boolean(opts.paused) }],
      marketing_config: [{ session_id: SESSION, autonomous_paused: Boolean(opts.marketingPaused) }],
      boost_campaigns: [],
    },
    { onInsert: oneLivePerPost },
  );
}

const input = (over: Record<string, unknown> = {}) =>
  CreateBoostInput.parse({ session_id: SESSION, post_id: "111", budget: 50, ...over });

describe("CreateBoostInput", () => {
  it("caps the founder-entered budget", () => {
    expect(() => input({ budget: 10_000 })).toThrow(/capped/);
    expect(() => input({ budget: 1 })).toThrow(/at least/);
    expect(() => input({ budget: 12.345 })).toThrow(/2 decimals/);
    expect(input().duration_days).toBe(7);
  });
});

describe("createBoost", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses while the campaign is paused", async () => {
    const { db } = setup({ marketingPaused: true });
    const p = provider();
    await expect(createBoost(db, input(), p)).rejects.toMatchObject({ code: "paused" });
    expect(p.boostPost).not.toHaveBeenCalled();
  });

  it("returns not_configured and writes nothing without X Ads credentials", async () => {
    const { db, tables } = setup();
    await expect(createBoost(db, input(), null)).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(tables.boost_campaigns).toHaveLength(0);
  });

  it("refuses posts that are not from the connected account", async () => {
    const { db, tables } = setup();
    const p = provider();
    await expect(createBoost(db, input({ post_id: "222" }), p)).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(p.boostPost).not.toHaveBeenCalled();
    expect(tables.boost_campaigns).toHaveLength(0);
  });

  it("claims, calls X Ads and records the campaign ids", async () => {
    const { db } = setup();
    const p = provider();
    const boost = await createBoost(db, input(), p);
    expect(p.boostPost).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: "111",
        authorUserId: "42",
        totalBudget: 50,
        durationDays: 7,
      }),
    );
    expect(boost).toMatchObject({
      status: "active",
      post_text: "Our launch post",
      x_campaign_id: "hwtbm",
      x_line_item_id: "8v7jo",
      currency: "USD",
    });
    expect(await listBoosts(db, SESSION)).toHaveLength(1);
  });

  it("blocks a second boost of the same post (double click)", async () => {
    const { db } = setup();
    const p = provider();
    await createBoost(db, input(), p);
    await expect(createBoost(db, input(), p)).rejects.toMatchObject({ code: "conflict" });
    expect(p.boostPost).toHaveBeenCalledTimes(1);
  });

  it("marks the boost failed with the reason, and allows a retry", async () => {
    const { db, tables } = setup();
    const failing = provider(async () => {
      throw new AppError("upstream_failed", "X Ads API error: tweet not promotable", {
        x_campaign_id: "hwtbm",
        campaign_deleted: true,
      });
    });
    await expect(createBoost(db, input(), failing)).rejects.toBeInstanceOf(AppError);
    expect(tables.boost_campaigns[0]).toMatchObject({
      status: "failed",
      x_campaign_id: null,
      error: "X Ads API error: tweet not promotable",
    });

    const ok = await createBoost(db, input(), provider());
    expect(ok.status).toBe("active");
  });

  it("keeps a stranded campaign id when X could not delete it", async () => {
    const { db, tables } = setup();
    const failing = provider(async () => {
      throw upstreamFailed("boom", { x_campaign_id: "hwtbm", campaign_deleted: false });
    });
    await expect(createBoost(db, input(), failing)).rejects.toBeInstanceOf(AppError);
    expect(tables.boost_campaigns[0]).toMatchObject({ status: "failed", x_campaign_id: "hwtbm" });
    expect(String(tables.boost_campaigns[0].error)).toMatch(/remove it in ads.x.com/);
  });
});
