/** Web search port. Research steps depend on this; vendors live in lib/adapters/search.ts. */

export interface SearchHit {
  title: string;
  url: string;
  /** Page text or snippet. */
  content: string;
}

export interface SearchProvider {
  readonly id: "linkup" | "exa" | "tavily";
  search(query: string, opts?: { limit?: number }): Promise<SearchHit[]>;
}
