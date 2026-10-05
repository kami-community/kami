// X API v2 with OAuth 2.0 user tokens — Kami acts as the logged-in user.

export interface PostReceipt {
  id: string;
  url: string;
}

export async function postTweet(text: string, accessToken: string): Promise<PostReceipt> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty post");
  if (trimmed.length > 280) throw new Error(`post too long (${trimmed.length}/280 chars)`);
  if (/https?:\/\//i.test(trimmed)) throw new Error("URLs in posts are blocked (13x API cost)");

  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: trimmed }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`X API ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  const id: string = json.data?.id;
  if (!id) throw new Error(`X API returned no post id: ${JSON.stringify(json).slice(0, 200)}`);
  return { id, url: `https://x.com/i/status/${id}` };
}

export interface TweetMetrics {
  id: string;
  public_metrics: Record<string, number>;
}

/** Fetch public metrics for the account's own posts. */
export async function getTweetMetrics(ids: string[], accessToken: string): Promise<TweetMetrics[]> {
  if (ids.length === 0) return [];
  const query = new URLSearchParams({ ids: ids.join(","), "tweet.fields": "public_metrics" });
  const res = await fetch(`https://api.x.com/2/tweets?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`X API ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json.data ?? [];
}

export interface TweetReply {
  author: string;
  text: string;
  at: string;
}

/** Fetch reply content for a post via recent search (conversation_id). */
export async function getReplies(postId: string, accessToken: string): Promise<TweetReply[]> {
  const query = new URLSearchParams({
    query: `conversation_id:${postId} is:reply`,
    "tweet.fields": "author_id,created_at",
    expansions: "author_id",
    max_results: "10",
  });
  const res = await fetch(`https://api.x.com/2/tweets/search/recent?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`X API ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  const users = new Map(
    (json.includes?.users ?? []).map((u: { id: string; username: string }) => [u.id, u.username]),
  );
  return (json.data ?? []).map((t: { author_id: string; text: string; created_at: string }) => ({
    author: `@${users.get(t.author_id) ?? t.author_id}`,
    text: t.text,
    at: t.created_at,
  }));
}
