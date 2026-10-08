import { z } from "zod";
import { hermesConfigured, runAgentJson } from "@/lib/hermes/client";
import type { MarketingConfig } from "@/lib/marketingTypes";
import type { DiscoveredCrmEntry, DiscoverResult } from "@/lib/marketingDiscoverTypes";
import { discoverXLeads } from "@/lib/xLeadDiscover";
import { discoverIgCreatorsViaApify, apifyConfigured } from "@/lib/apifyIgDiscover";
import { requireConnection } from "@/lib/connections/service";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";

export type { DiscoveredCrmEntry, DiscoverResult } from "@/lib/marketingDiscoverTypes";

function dossierBits(dossier: unknown): {
  competitors: string[];
  icpLabels: string[];
  nicheFromOpp: string[];
} {
  if (!dossier || typeof dossier !== "object") {
    return { competitors: [], icpLabels: [], nicheFromOpp: [] };
  }
  const d = dossier as {
    competitor_analysis?: { name?: string }[];
    icp_buckets?: { label?: string; angle?: string }[];
    opportunities?: { title?: string }[];
  };
  return {
    competitors: (d.competitor_analysis ?? [])
      .map((c) => c.name)
      .filter((n): n is string => Boolean(n)),
    icpLabels: (d.icp_buckets ?? []).map((b) => b.label).filter((n): n is string => Boolean(n)),
    nicheFromOpp: (d.opportunities ?? [])
      .map((o) => o.title)
      .filter((n): n is string => Boolean(n)),
  };
}

const RankedSchema = z.object({
  entries: z.array(
    z.object({
      handle: z.string().min(1),
      platform: z.enum(["x", "instagram"]).optional(),
      niche_match_score: z.number().min(0).max(1).optional(),
      relevance_reasoning: z.string().optional(),
    }),
  ),
});

/**
 * Optional ranking pass by the marketing-researcher agent. It may only re-score
 * and explain candidates that discovery actually found — never add handles.
 */
async function rankCandidates(
  entries: DiscoveredCrmEntry[],
  context: { sessionId: string; domain: string | null; config: MarketingConfig },
): Promise<DiscoveredCrmEntry[]> {
  if (!hermesConfigured() || entries.length === 0) return entries;

  let ranked: z.infer<typeof RankedSchema>;
  try {
    ({ data: ranked } = await runAgentJson({
      agent: "marketing-researcher",
      kind: "marketing_rank",
      kamiSessionId: context.sessionId,
      schema: RankedSchema,
      input: [
        "Rank these REAL marketing CRM candidates for the campaign. Do NOT add new handles.",
        'Return one fenced json block: {"entries":[...]} with the same handles,',
        "an updated niche_match_score (0-1) and relevance_reasoning for each.",
        `domain: ${context.domain ?? "unknown"}`,
        `platforms: ${JSON.stringify(context.config.platforms)}`,
        `niche keywords: ${JSON.stringify(context.config.ig_niche_keywords ?? [])}`,
        "```json",
        JSON.stringify({ entries }, null, 2),
        "```",
      ].join("\n"),
    }));
  } catch {
    return entries; // ranking is optional; the candidates themselves are real
  }

  const byHandle = new Map(entries.map((e) => [`${e.platform}:${e.handle.toLowerCase()}`, e]));
  const result: DiscoveredCrmEntry[] = [];
  for (const row of ranked.entries) {
    const base = byHandle.get(
      `${row.platform ?? "x"}:${row.handle.replace(/^@/, "").toLowerCase()}`,
    );
    if (!base) continue; // never invent
    result.push({
      ...base,
      niche_match_score: row.niche_match_score ?? base.niche_match_score,
      relevance_reasoning: row.relevance_reasoning ?? base.relevance_reasoning,
    });
  }
  return result.length ? result : entries;
}

/**
 * Real discovery: X recent-search via user OAuth + Instagram via Apify.
 * Hermes only ranks verified candidates — never invents profiles.
 */
export async function runMarketingDiscovery(params: {
  config: MarketingConfig;
  domain: string | null;
  dossier: unknown;
  sessionId: string;
}): Promise<DiscoverResult> {
  const { config, domain, dossier, sessionId } = params;
  const bits = dossierBits(dossier);
  const warnings: string[] = [];
  const entries: DiscoveredCrmEntry[] = [];
  const errors: string[] = [];

  const nicheKeywords = [
    ...(config.ig_niche_keywords ?? []),
    ...bits.nicheFromOpp,
    ...bits.icpLabels,
  ];

  if (config.platforms.includes("x")) {
    const x = await discoverXLeads({
      sessionId,
      domain,
      nicheKeywords,
      competitors: bits.competitors,
      icpLabels: bits.icpLabels,
      limit: 15,
    });
    if (x.error) errors.push(x.error);
    entries.push(...x.entries);
  }

  if (config.platforms.includes("instagram")) {
    try {
      await requireConnection(db(), sessionId, "instagram");
    } catch (err) {
      // Only "not connected" becomes a warning; anything else is a real failure.
      if (!(err instanceof AppError && err.details?.needs_connection)) throw err;
      warnings.push(
        "Instagram is not connected for this campaign — connect it before sending creator DMs.",
      );
    }
    if (!apifyConfigured()) {
      errors.push(
        "APIFY_API_TOKEN not set — required to find Instagram creators (see docs/marketing-credentials.md)",
      );
    } else {
      const ig = await discoverIgCreatorsViaApify({
        keywords: config.ig_niche_keywords?.length ? config.ig_niche_keywords : nicheKeywords,
        minFollowers: config.ig_min_followers ?? 5000,
        limit: 15,
      });
      if (ig.error) errors.push(ig.error);
      entries.push(...ig.entries);
    }
  }

  if (!entries.length) {
    return {
      entries: [],
      needsInput: {
        code: "NO_DISCOVERY_RESULTS",
        message: errors.join(" · ") || "No leads or creators found",
      },
      warnings,
    };
  }

  const ranked = await rankCandidates(entries, { sessionId, domain, config });
  return {
    entries: ranked,
    warnings: [...warnings, ...(ranked.length ? [] : errors)],
  };
}
