import { getUsers, searchRecent } from "@/lib/adapters/x/api";
import { requireConnection } from "@/lib/connections/service";
import { db } from "@/lib/db/client";
import type { DiscoveredCrmEntry } from "@/lib/marketingDiscoverTypes";

function buildSearchQueries(params: {
  domain: string | null;
  nicheKeywords: string[];
  competitors: string[];
  icpLabels: string[];
}): string[] {
  const queries: string[] = [];
  for (const kw of params.nicheKeywords.slice(0, 4)) {
    const clean = kw.replace(/[^a-zA-Z0-9_\s-]/g, "").trim();
    if (clean) queries.push(`("${clean}") -is:retweet lang:en`);
  }
  for (const c of params.competitors.slice(0, 3)) {
    const handle = c.replace(/^@/, "").trim();
    if (handle) queries.push(`(@${handle} OR from:${handle}) -is:retweet`);
  }
  for (const label of params.icpLabels.slice(0, 2)) {
    const clean = label.replace(/[^a-zA-Z0-9_\s-]/g, "").trim();
    if (clean) queries.push(`("${clean}") -is:retweet lang:en`);
  }
  if (!queries.length && params.domain) {
    const brand = params.domain.split(".")[0];
    if (brand) queries.push(`("${brand}") -is:retweet lang:en`);
  }
  return [...new Set(queries)].slice(0, 5);
}

/**
 * Discover X leads with the connected account's token and recent search.
 * Never fabricates profiles — returns an explanatory error instead of guesses.
 */
export async function discoverXLeads(params: {
  sessionId: string;
  domain: string | null;
  nicheKeywords: string[];
  competitors: string[];
  icpLabels: string[];
  limit?: number;
}): Promise<{ entries: DiscoveredCrmEntry[]; error?: string }> {
  let account;
  try {
    account = await requireConnection(db(), params.sessionId, "x");
  } catch (err) {
    return { entries: [], error: err instanceof Error ? err.message : "X is not connected" };
  }

  const queries = buildSearchQueries(params);
  if (!queries.length) {
    return {
      entries: [],
      error: "No search keywords — set niche keywords in Marketing setup or complete the dossier",
    };
  }

  const snippets = new Map<string, string>();
  let lastError: string | undefined;
  for (const query of queries) {
    try {
      for (const hit of await searchRecent(account.accessToken, query)) {
        if (!snippets.has(hit.authorId)) snippets.set(hit.authorId, hit.text.slice(0, 160));
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "X search failed";
    }
  }

  const ids = [...snippets.keys()].slice(0, params.limit ?? 25);
  if (!ids.length)
    return { entries: [], error: lastError ?? "X search returned no authors for these keywords" };

  let users;
  try {
    users = await getUsers(account.accessToken, ids);
  } catch (err) {
    return {
      entries: [],
      error: err instanceof Error ? err.message : "Could not resolve X user profiles",
    };
  }

  const selfHandle = account.handle.replace(/^@/, "").toLowerCase();
  const entries: DiscoveredCrmEntry[] = users
    .filter((u) => u.username.toLowerCase() !== selfHandle)
    .map((u) => {
      const snippet = snippets.get(u.id);
      const followers = u.public_metrics?.followers_count ?? 0;
      return {
        type: "x_lead",
        platform: "x",
        handle: u.username,
        name: u.name,
        followers,
        niche_match_score: Math.min(1, 0.4 + Math.log10(Math.max(followers, 10)) / 10),
        relevance_reasoning: snippet
          ? `Matched recent post: “${snippet}${snippet.length >= 160 ? "…" : ""}”`
          : u.description
            ? `Bio: ${u.description.slice(0, 140)}`
            : "Matched niche keyword search",
        status: "identified",
      };
    });

  return { entries: entries.slice(0, params.limit ?? 15) };
}
