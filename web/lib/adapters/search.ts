import type { SearchHit, SearchProvider } from "@/lib/ports/search";

/**
 * Search adapters. Each returns [] on provider errors: search enriches research
 * but never blocks it (first-party evidence is always collected separately).
 */

const DEFAULT_LIMIT = 8;
const TIMEOUT_MS = 20_000;

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const clean = (hits: SearchHit[], limit: number) =>
  hits.filter((h) => h.url && h.content).slice(0, limit);

export function createLinkupSearch(apiKey: string): SearchProvider {
  return {
    id: "linkup",
    async search(query, opts) {
      const json = (await postJson(
        "https://api.linkup.so/v1/search",
        { Authorization: `Bearer ${apiKey}` },
        { q: query, depth: "standard", outputType: "searchResults" },
      )) as { results?: { name?: string; url?: string; content?: string }[] } | null;
      const hits = (json?.results ?? []).map((r) => ({
        title: r.name ?? r.url ?? "",
        url: r.url ?? "",
        content: r.content ?? "",
      }));
      return clean(hits, opts?.limit ?? DEFAULT_LIMIT);
    },
  };
}

export function createExaSearch(apiKey: string): SearchProvider {
  return {
    id: "exa",
    async search(query, opts) {
      const limit = opts?.limit ?? DEFAULT_LIMIT;
      const json = (await postJson(
        "https://api.exa.ai/search",
        { "x-api-key": apiKey },
        { query, numResults: limit, contents: { text: { maxCharacters: 2000 } } },
      )) as {
        results?: { title?: string; url?: string; text?: string; highlights?: string[] }[];
      } | null;
      const hits = (json?.results ?? []).map((r) => ({
        title: r.title ?? r.url ?? "",
        url: r.url ?? "",
        content: r.text ?? r.highlights?.join(" … ") ?? "",
      }));
      return clean(hits, limit);
    },
  };
}

export function createTavilySearch(apiKey: string): SearchProvider {
  return {
    id: "tavily",
    async search(query, opts) {
      const limit = Math.min(opts?.limit ?? DEFAULT_LIMIT, 20);
      const json = (await postJson(
        "https://api.tavily.com/search",
        { Authorization: `Bearer ${apiKey}` },
        { query, max_results: limit, search_depth: "basic" },
      )) as { results?: { title?: string; url?: string; content?: string }[] } | null;
      const hits = (json?.results ?? []).map((r) => ({
        title: r.title ?? r.url ?? "",
        url: r.url ?? "",
        content: r.content ?? "",
      }));
      return clean(hits, limit);
    },
  };
}
