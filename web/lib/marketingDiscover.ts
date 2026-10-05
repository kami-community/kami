import type { MarketingConfig } from "@/lib/marketingTypes";
import type { DiscoveredCrmEntry, DiscoverResult } from "@/lib/marketingDiscoverTypes";
import { discoverXLeads } from "@/lib/xLeadDiscover";
import { discoverIgCreatorsViaApify, apifyConfigured } from "@/lib/apifyIgDiscover";
import { getValidIgAccessToken } from "@/lib/igOauth";

export type { DiscoveredCrmEntry, DiscoverResult } from "@/lib/marketingDiscoverTypes";

const GATEWAY = process.env.HERMES_GATEWAY_URL ?? "http://127.0.0.1:8642/v1/chat/completions";
const KEY = process.env.HERMES_API_KEY;

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
    nicheFromOpp: (d.opportunities ?? []).map((o) => o.title).filter((n): n is string => Boolean(n)),
  };
}

/** Optional Hermes pass: re-score / rewrite reasoning for real candidates only. */
async function rankWithHermes(
  entries: DiscoveredCrmEntry[],
  hermesSessionId: string,
  context: { domain: string | null; config: MarketingConfig },
): Promise<DiscoveredCrmEntry[]> {
  if (!KEY || entries.length === 0) return entries;

  const prompt = [
    "You rank REAL marketing CRM candidates. Do NOT invent new handles.",
    "Return ONLY a fenced json block: {\"entries\":[...]} with the same handles,",
    "updated niche_match_score (0-1) and relevance_reasoning.",
    `domain: ${context.domain ?? "unknown"}`,
    `platforms: ${JSON.stringify(context.config.platforms)}`,
    `ig_niche_keywords: ${JSON.stringify(context.config.ig_niche_keywords ?? [])}`,
    "```json",
    JSON.stringify({ entries }, null, 2),
    "```",
  ].join("\n");

  try {
    const upstream = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "X-Hermes-Session-Id": hermesSessionId,
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        stream: false,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const text = await upstream.text();
    if (!upstream.ok) return entries;

    let assistant = text;
    try {
      const json = JSON.parse(text) as {
        choices?: { message?: { content?: string } }[];
      };
      assistant = json.choices?.[0]?.message?.content ?? text;
    } catch {
      /* keep */
    }

    const fence = [...assistant.matchAll(/```json\s*([\s\S]*?)```/gi)].at(-1)?.[1];
    if (!fence) return entries;
    const parsed = JSON.parse(fence) as { entries?: DiscoveredCrmEntry[] };
    if (!Array.isArray(parsed.entries)) return entries;

    const byHandle = new Map(entries.map((e) => [`${e.platform}:${e.handle.toLowerCase()}`, e]));
    const ranked: DiscoveredCrmEntry[] = [];
    for (const row of parsed.entries) {
      if (!row?.handle) continue;
      const key = `${row.platform ?? "x"}:${String(row.handle).replace(/^@/, "").toLowerCase()}`;
      const base = byHandle.get(key);
      if (!base) continue; // never invent
      ranked.push({
        ...base,
        niche_match_score:
          typeof row.niche_match_score === "number" ? row.niche_match_score : base.niche_match_score,
        relevance_reasoning:
          typeof row.relevance_reasoning === "string"
            ? row.relevance_reasoning
            : base.relevance_reasoning,
      });
    }
    return ranked.length ? ranked : entries;
  } catch {
    return entries;
  }
}

/**
 * Real discovery: X recent-search via user OAuth + Instagram via Apify.
 * Hermes only ranks verified candidates — never invents profiles.
 */
export async function runMarketingDiscovery(params: {
  config: MarketingConfig;
  domain: string | null;
  dossier: unknown;
  hermesSessionId: string;
  sessionId: string;
}): Promise<DiscoverResult> {
  const { config, domain, dossier, hermesSessionId, sessionId } = params;
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
    const igAccount = await getValidIgAccessToken({ sessionId });
    if (!igAccount) {
      warnings.push(
        "Instagram not connected for this session — Log in with Instagram on the landing page before launching.",
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

  const ranked = await rankWithHermes(entries, hermesSessionId, { domain, config });
  return {
    entries: ranked,
    warnings: [...warnings, ...(ranked.length ? [] : errors)],
  };
}
