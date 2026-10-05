// Linkup + first-party research — grounded in validated DomainIdentity only.

import type { DomainIdentity } from "./domainIdentity";
import { sameRegistrableHost } from "./domainIdentity";

const KEY = process.env.LINKUP_API_KEY;

export function linkupConfigured(): boolean {
  return Boolean(KEY);
}

export interface ResearchSource {
  title: string;
  url: string;
  excerpt: string;
  source_class: "first_party" | "third_party_mention";
  query: string;
}

export interface ResearchSnapshot {
  canonical_domain: string;
  identity: DomainIdentity;
  sources: ResearchSource[];
  facts_markdown: string;
  created_at: string;
}

export type ResearchResult =
  { ok: true; snapshot: ResearchSnapshot } | { ok: false; reason: string };

interface LinkupResult {
  name: string;
  url: string;
  content: string;
}

export async function searchLinkup(q: string): Promise<LinkupResult[]> {
  if (!KEY) return [];
  const res = await fetch("https://api.linkup.so/v1/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ q, depth: "standard", outputType: "searchResults" }),
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({ results: [] }));
  return (json.results ?? []).slice(0, 8);
}

function classifySource(
  url: string,
  canonical: string,
): "first_party" | "third_party_mention" | null {
  try {
    const host = new URL(url.includes("://") ? url : `https://${url}`).hostname;
    if (sameRegistrableHost(host, canonical)) return "first_party";
    return "third_party_mention";
  } catch {
    return null;
  }
}

function toSource(
  r: LinkupResult,
  query: string,
  canonical: string,
  requireMention?: boolean,
): ResearchSource | null {
  if (!r.url || !r.content) return null;
  const cls = classifySource(r.url, canonical);
  if (!cls) return null;
  if (cls === "third_party_mention" && requireMention) {
    const hay = `${r.name} ${r.content} ${r.url}`.toLowerCase();
    if (!hay.includes(canonical.toLowerCase()) && !hay.includes(canonical.split(".")[0])) {
      return null;
    }
  }
  return {
    title: r.name || r.url,
    url: r.url,
    excerpt: r.content.slice(0, 500),
    source_class: cls,
    query,
  };
}

/**
 * Research for a validated identity. First-party homepage evidence is mandatory.
 * Third-party alone cannot establish identity.
 */
export async function researchDomainIdentity(identity: DomainIdentity): Promise<ResearchResult> {
  const host = identity.canonical_domain;
  const sources: ResearchSource[] = [
    {
      title: identity.title || identity.company_name || host,
      url: identity.evidence_url,
      excerpt: identity.excerpt.slice(0, 800),
      source_class: "first_party",
      query: "direct_homepage_extract",
    },
  ];

  if (linkupConfigured()) {
    const queries = [
      `site:${host} (about OR product OR pricing OR customers)`,
      `site:${host} (customers OR "case study" OR documentation OR docs)`,
      `"${host}" competitors OR alternatives OR firebase OR "open source" OR open-source`,
      `site:${host} (open-source OR "open source" OR firebase OR alternatives OR vs)`,
      `site:${host} (funding OR hiring OR launch OR release)`,
    ];

    const resultSets = await Promise.all(queries.map((q) => searchLinkup(q)));
    for (let i = 0; i < resultSets.length; i++) {
      const q = queries[i];
      for (const r of resultSets[i]) {
        const src = toSource(r, q, host, i >= 2);
        if (!src) continue;
        if (sources.some((s) => s.url === src.url)) continue;
        sources.push(src);
      }
    }
  }

  const firstParty = sources.filter((s) => s.source_class === "first_party");
  if (!firstParty.length || firstParty[0].excerpt.length < 40) {
    return {
      ok: false,
      reason: "Could not extract usable content from the submitted domain",
    };
  }

  const facts_markdown = [
    `### Canonical domain\n- ${host} (${identity.final_url})\n- Company (from site): ${identity.company_name ?? "unknown"}\n- Ignore other companies that share a similar brand name but a different domain.`,
    `### First-party evidence\n${firstParty
      .map((s) => `- ${s.title} (${s.url}): ${s.excerpt}`)
      .join("\n")}`,
    sources.some((s) => s.source_class === "third_party_mention")
      ? `### Third-party mentions (only if they explicitly name ${host})\n${sources
          .filter((s) => s.source_class === "third_party_mention")
          .slice(0, 8)
          .map((s) => `- ${s.title} (${s.url}): ${s.excerpt}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    ok: true,
    snapshot: {
      canonical_domain: host,
      identity,
      sources,
      facts_markdown,
      created_at: new Date().toISOString(),
    },
  };
}
