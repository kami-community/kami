import { env } from "@/lib/config/env";
import type { DiscoveredCrmEntry } from "@/lib/marketingDiscoverTypes";

export function apifyConfigured(): boolean {
  return Boolean(env().APIFY_API_TOKEN);
}

interface ApifyItem {
  ownerUsername?: string;
  username?: string;
  fullName?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  biography?: string;
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  url?: string;
}

function normalizeHandle(raw: string): string {
  return raw.replace(/^@/, "").trim();
}

/**
 * Search Instagram creators by niche hashtags via Apify.
 * Requires APIFY_API_TOKEN. Does not fabricate profiles.
 */
export async function discoverIgCreatorsViaApify(params: {
  keywords: string[];
  minFollowers: number;
  limit?: number;
}): Promise<{ entries: DiscoveredCrmEntry[]; error?: string }> {
  const { APIFY_API_TOKEN: APIFY_TOKEN, APIFY_IG_HASHTAG_ACTOR: ACTOR } = env();
  if (!APIFY_TOKEN) {
    return {
      entries: [],
      error: "APIFY_API_TOKEN not set — add it to web/.env.local for Instagram creator discovery",
    };
  }

  const hashtags = params.keywords
    .map((k) => k.replace(/^#/, "").trim().toLowerCase().replace(/\s+/g, ""))
    .filter(Boolean)
    .slice(0, 3);

  if (!hashtags.length) {
    return {
      entries: [],
      error: "No Instagram niche keywords — set them in Marketing setup",
    };
  }

  const actorPath = ACTOR.includes("/") ? ACTOR.replace("/", "~") : ACTOR;
  const runUrl = `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;

  let items: ApifyItem[] = [];
  try {
    const res = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hashtags,
        resultsLimit: Math.min(params.limit ?? 30, 50),
        resultsType: "posts",
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        typeof json === "object" && json && "error" in json
          ? String((json as { error?: unknown }).error)
          : `Apify ${res.status}`;
      return { entries: [], error: msg };
    }
    items = Array.isArray(json) ? (json as ApifyItem[]) : [];
  } catch (e) {
    return {
      entries: [],
      error: e instanceof Error ? e.message : "Apify request failed",
    };
  }

  const byHandle = new Map<string, DiscoveredCrmEntry>();
  for (const item of items) {
    const handle = normalizeHandle(item.ownerUsername ?? item.username ?? "");
    if (!handle) continue;
    const followers = item.followersCount ?? 0;
    if (followers > 0 && followers < params.minFollowers) continue;

    const likes = item.likesCount ?? 0;
    const comments = item.commentsCount ?? 0;
    const engagement =
      followers > 0 ? Math.min(1, (likes + comments * 3) / Math.max(followers, 1)) : undefined;

    const existing = byHandle.get(handle);
    const score = Math.min(
      1,
      0.35 +
        (followers > 0 ? Math.log10(Math.max(followers, 10)) / 8 : 0.2) +
        (engagement ?? 0) * 2,
    );

    const reasoningParts = [
      `Found via hashtag search (${hashtags.map((h) => `#${h}`).join(", ")})`,
      item.caption ? `Recent caption: “${item.caption.slice(0, 100)}…”` : null,
      item.biography ? `Bio: ${item.biography.slice(0, 100)}` : null,
    ].filter(Boolean);

    if (!existing || (existing.niche_match_score ?? 0) < score) {
      byHandle.set(handle, {
        type: "creator",
        platform: "instagram",
        handle,
        name: item.fullName,
        followers: followers || existing?.followers,
        engagement_rate: engagement ?? existing?.engagement_rate,
        niche_match_score: score,
        relevance_reasoning: reasoningParts.join(" · "),
        status: "identified",
      });
    }
  }

  const entries = [...byHandle.values()]
    .sort((a, b) => (b.niche_match_score ?? 0) - (a.niche_match_score ?? 0))
    .slice(0, params.limit ?? 15);

  if (!entries.length) {
    return {
      entries: [],
      error: `Apify returned no creators for hashtags: ${hashtags.map((h) => `#${h}`).join(", ")}`,
    };
  }

  return { entries };
}
