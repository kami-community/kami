import { resolveXAccess } from "@/lib/xCreds";
import type { DiscoveredCrmEntry } from "@/lib/marketingDiscoverTypes";

interface XUser {
  id: string;
  username: string;
  name?: string;
  description?: string;
  public_metrics?: { followers_count?: number };
}

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
 * Discover X leads using the connected user's OAuth token + recent search.
 * Never fabricates profiles — returns empty if search fails or no token.
 */
export async function discoverXLeads(params: {
  sessionId: string;
  domain: string | null;
  nicheKeywords: string[];
  competitors: string[];
  icpLabels: string[];
  limit?: number;
}): Promise<{ entries: DiscoveredCrmEntry[]; error?: string }> {
  const access = await resolveXAccess({ sessionId: params.sessionId });
  if (!access) {
    return {
      entries: [],
      error:
        "X is not connected for this session — Log in with X on the landing page, then launch the campaign",
    };
  }

  const queries = buildSearchQueries(params);
  if (!queries.length) {
    return {
      entries: [],
      error: "No search keywords — set niche keywords in Marketing setup or complete the dossier",
    };
  }

  const authorIds = new Set<string>();
  const tweetSnippets = new Map<string, string>();

  for (const query of queries) {
    const qs = new URLSearchParams({
      query,
      max_results: "20",
      "tweet.fields": "author_id,created_at,text",
      expansions: "author_id",
    });
    try {
      const res = await fetch(`https://api.x.com/2/tweets/search/recent?${qs}`, {
        headers: { Authorization: `Bearer ${access.token}` },
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { author_id?: string; text?: string }[];
        errors?: { message?: string }[];
        title?: string;
        detail?: string;
      };
      if (!res.ok) {
        const msg =
          json.detail ?? json.title ?? json.errors?.[0]?.message ?? `X search ${res.status}`;
        // Continue other queries; surface last error if nothing found
        if (!authorIds.size) {
          return { entries: [], error: msg };
        }
        continue;
      }
      for (const tw of json.data ?? []) {
        if (tw.author_id) {
          authorIds.add(tw.author_id);
          if (tw.text && !tweetSnippets.has(tw.author_id)) {
            tweetSnippets.set(tw.author_id, tw.text.slice(0, 160));
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "X search failed";
      if (!authorIds.size) return { entries: [], error: msg };
    }
  }

  // Drop our own account if present
  const selfHandle = access.handle.replace(/^@/, "").toLowerCase();
  const ids = [...authorIds].slice(0, params.limit ?? 25);
  if (!ids.length) {
    return { entries: [], error: "X search returned no authors for these keywords" };
  }

  const userQs = new URLSearchParams({
    ids: ids.join(","),
    "user.fields": "description,public_metrics,username,name",
  });
  const usersRes = await fetch(`https://api.x.com/2/users?${userQs}`, {
    headers: { Authorization: `Bearer ${access.token}` },
  });
  const usersJson = (await usersRes.json().catch(() => ({}))) as {
    data?: XUser[];
    errors?: { message?: string }[];
  };
  if (!usersRes.ok || !usersJson.data?.length) {
    return {
      entries: [],
      error: usersJson.errors?.[0]?.message ?? "Could not resolve X user profiles",
    };
  }

  const entries: DiscoveredCrmEntry[] = [];
  for (const u of usersJson.data) {
    if (u.username.toLowerCase() === selfHandle) continue;
    const snippet = tweetSnippets.get(u.id);
    const followers = u.public_metrics?.followers_count ?? 0;
    entries.push({
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
    });
  }

  return { entries: entries.slice(0, params.limit ?? 15) };
}
