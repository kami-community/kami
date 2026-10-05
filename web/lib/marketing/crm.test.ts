import { describe, expect, it } from "vitest";
import type { DiscoveredCrmEntry } from "@/lib/marketingDiscoverTypes";
import { normalizeHandle, prepareDiscoveredEntries } from "./crm";

const lead = (handle: string, extra: Partial<DiscoveredCrmEntry> = {}): DiscoveredCrmEntry => ({
  type: "x_lead",
  platform: "x",
  handle,
  ...extra,
});

const creator = (handle: string, extra: Partial<DiscoveredCrmEntry> = {}): DiscoveredCrmEntry => ({
  type: "creator",
  platform: "instagram",
  handle,
  ...extra,
});

describe("normalizeHandle", () => {
  it("strips leading @ and whitespace", () => {
    expect(normalizeHandle("  @@founder ")).toBe("founder");
  });
});

describe("prepareDiscoveredEntries", () => {
  it("keeps only the campaign's platforms", () => {
    const out = prepareDiscoveredEntries([lead("a"), creator("b")], { platforms: ["x"] });
    expect(out.map((e) => e.handle)).toEqual(["a"]);
  });

  it("dedupes by platform and case-insensitive handle, first wins", () => {
    const out = prepareDiscoveredEntries(
      [lead("@Alice", { name: "first" }), lead("alice", { name: "second" }), creator("alice")],
      { platforms: ["x", "instagram"] },
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ platform: "x", handle: "Alice", name: "first" });
    expect(out[1]).toMatchObject({ platform: "instagram", handle: "alice" });
  });

  it("drops empty handles", () => {
    expect(prepareDiscoveredEntries([lead("@ ")], { platforms: ["x"] })).toEqual([]);
  });

  it("defaults a creator's offer to the middle of the range, never a lead's", () => {
    const out = prepareDiscoveredEntries(
      [creator("c"), creator("d", { offer_amount: 80 }), lead("l")],
      {
        platforms: ["x", "instagram"],
        offerMin: 50,
        offerMax: 301,
      },
    );
    expect(out.map((e) => e.offer_amount)).toEqual([176, 80, undefined]);
  });

  it("leaves the offer unset without a configured range", () => {
    const out = prepareDiscoveredEntries([creator("c")], {
      platforms: ["instagram"],
      offerMin: 50,
    });
    expect(out[0].offer_amount).toBeUndefined();
  });
});
