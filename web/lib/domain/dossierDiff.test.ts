import { describe, expect, it } from "vitest";
import type { Dossier } from "./dossier";
import { applyDossierDiff, diffDossier } from "./dossierDiff";

const base: Dossier = {
  canonical_domain: "acme.dev",
  company: "Acme",
  brand_voice: "Plain",
  positioning: "Acme helps small teams ship invoices faster.",
  tone: ["plain"],
  industries: [],
  personas: [],
  geos: [],
  competitor_analysis: [{ name: "Old Co", insight: "slow" }],
  icp_buckets: [
    { label: "Agencies", where_they_live: "", trigger_signal: "", est_size: "", angle: "a" },
    { label: "Studios", where_they_live: "", trigger_signal: "", est_size: "", angle: "b" },
  ],
  evidence_urls: ["https://acme.dev"],
};

const proposed: Dossier = {
  ...base,
  positioning: "Acme helps finance teams at agencies close the month faster.",
  competitor_analysis: [{ name: "New Co", insight: "fast" }],
  icp_buckets: [{ ...base.icp_buckets[0], angle: "close faster" }, base.icp_buckets[1]],
};

describe("diffDossier", () => {
  it("lists changed, added and removed fields", () => {
    const rows = diffDossier(base, proposed).filter((r) => r.kind !== "same");
    expect(rows.map((r) => [r.key, r.kind])).toEqual([
      ["positioning", "changed"],
      ["competitor:old co", "removed"],
      ["competitor:new co", "added"],
      ["icp:agencies", "changed"],
    ]);
  });
});

describe("applyDossierDiff", () => {
  it("applies only the kept changes", () => {
    const next = applyDossierDiff(base, proposed, ["positioning", "competitor:new co"]);
    expect(next.positioning).toBe(proposed.positioning);
    expect(next.competitor_analysis.map((c) => c.name)).toEqual(["Old Co", "New Co"]);
    expect(next.icp_buckets[0].angle).toBe("a");
  });

  it("drops a removal only when it is kept", () => {
    const next = applyDossierDiff(base, proposed, ["competitor:old co"]);
    expect(next.competitor_analysis).toEqual([]);
  });
});
