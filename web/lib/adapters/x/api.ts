import { AppError, badRequest, upstreamFailed } from "@/lib/http/errors";

/**
 * X API v2 with an OAuth 2.0 user token — Kami acts as the connected account.
 * Every call goes through `xFetch` for consistent error handling.
 */

const API = "https://api.x.com/2";

export const MAX_POST_CHARS = 280;
const MAX_DM_CHARS = 10_000;

interface XErrorBody {
  title?: string;
  detail?: string;
  errors?: { message?: string }[];
}

async function xFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const json = (await res.json().catch(() => ({}))) as T & XErrorBody;
  if (!res.ok) {
    const message = json.detail ?? json.title ?? json.errors?.[0]?.message ?? `HTTP ${res.status}`;
    if (res.status === 401)
      throw new AppError("unauthorized", `X rejected the token — reconnect X (${message})`);
    if (res.status === 403) {
      throw new AppError(
        "forbidden",
        `X refused the request: ${message}. Your X API tier or app scopes may not allow this.`,
      );
    }
    throw upstreamFailed(`X API error: ${message}`, { provider_status: res.status });
  }
  return json;
}

/** Validate a public post before sending. Links are refused: X bills link posts at a higher rate. */
export function validatePostText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw badRequest("post text is empty");
  if (trimmed.length > MAX_POST_CHARS)
    throw badRequest(`post is too long (${trimmed.length}/${MAX_POST_CHARS})`);
  if (/https?:\/\//i.test(trimmed)) throw badRequest("links are not allowed in X posts");
  return trimmed;
}

export interface XPost {
  id: string;
  url: string;
}

export async function createPost(token: string, text: string): Promise<XPost> {
  const body = validatePostText(text);
  const json = await xFetch<{ data?: { id?: string } }>(token, "/tweets", {
    method: "POST",
    body: JSON.stringify({ text: body }),
  });
  const id = json.data?.id;
  if (!id) throw upstreamFailed("X accepted the post but returned no id");
  return { id, url: `https://x.com/i/status/${id}` };
}

export interface XUser {
  id: string;
  username: string;
  name?: string;
  description?: string;
  public_metrics?: { followers_count?: number };
}

export async function getMe(token: string): Promise<XUser> {
  const json = await xFetch<{ data?: XUser }>(token, "/users/me");
  if (!json.data?.id) throw upstreamFailed("could not read the connected X profile");
  return json.data;
}

export async function getUsers(token: string, ids: string[]): Promise<XUser[]> {
  if (!ids.length) return [];
  const qs = new URLSearchParams({
    ids: ids.join(","),
    "user.fields": "description,public_metrics,username,name",
  });
  const json = await xFetch<{ data?: XUser[] }>(token, `/users?${qs}`);
  return json.data ?? [];
}

export interface XTimelinePost {
  id: string;
  text: string;
  created_at?: string;
  public_metrics?: Record<string, number>;
}

export async function getUserPosts(
  token: string,
  userId: string,
  limit = 10,
): Promise<XTimelinePost[]> {
  const qs = new URLSearchParams({
    max_results: String(limit),
    "tweet.fields": "public_metrics,created_at",
    exclude: "retweets,replies",
  });
  const json = await xFetch<{ data?: XTimelinePost[] }>(token, `/users/${userId}/tweets?${qs}`);
  return json.data ?? [];
}

export async function getPostMetrics(token: string, ids: string[]): Promise<XTimelinePost[]> {
  if (!ids.length) return [];
  const qs = new URLSearchParams({ ids: ids.join(","), "tweet.fields": "public_metrics" });
  const json = await xFetch<{ data?: XTimelinePost[] }>(token, `/tweets?${qs}`);
  return json.data ?? [];
}

export interface XReply {
  author: string;
  text: string;
  at: string;
}

export async function getReplies(token: string, postId: string): Promise<XReply[]> {
  const qs = new URLSearchParams({
    query: `conversation_id:${postId} is:reply`,
    "tweet.fields": "author_id,created_at",
    expansions: "author_id",
    max_results: "10",
  });
  const json = await xFetch<{
    data?: { author_id: string; text: string; created_at: string }[];
    includes?: { users?: { id: string; username: string }[] };
  }>(token, `/tweets/search/recent?${qs}`);
  const users = new Map((json.includes?.users ?? []).map((u) => [u.id, u.username]));
  return (json.data ?? []).map((t) => ({
    author: `@${users.get(t.author_id) ?? t.author_id}`,
    text: t.text,
    at: t.created_at,
  }));
}

export interface XSearchHit {
  authorId: string;
  text: string;
}

export async function searchRecent(
  token: string,
  query: string,
  limit = 20,
): Promise<XSearchHit[]> {
  const qs = new URLSearchParams({
    query,
    max_results: String(limit),
    "tweet.fields": "author_id,created_at,text",
    expansions: "author_id",
  });
  const json = await xFetch<{ data?: { author_id?: string; text?: string }[] }>(
    token,
    `/tweets/search/recent?${qs}`,
  );
  return (json.data ?? [])
    .filter((t): t is { author_id: string; text?: string } => Boolean(t.author_id))
    .map((t) => ({ authorId: t.author_id, text: t.text ?? "" }));
}

export interface XDirectMessage {
  eventId: string;
  conversationId?: string;
}

export async function sendDirectMessage(
  token: string,
  recipientHandle: string,
  text: string,
): Promise<XDirectMessage> {
  const handle = recipientHandle.replace(/^@/, "").trim();
  const body = text.trim();
  if (!handle) throw badRequest("recipient handle required");
  if (!body) throw badRequest("message text required");
  if (body.length > MAX_DM_CHARS) throw badRequest("message is too long");

  const user = await xFetch<{ data?: { id?: string } }>(
    token,
    `/users/by/username/${encodeURIComponent(handle)}`,
  );
  if (!user.data?.id) throw badRequest(`could not find @${handle} on X`);

  const json = await xFetch<{ data?: { dm_event_id?: string; dm_conversation_id?: string } }>(
    token,
    `/dm_conversations/with/${user.data.id}/messages`,
    { method: "POST", body: JSON.stringify({ text: body }) },
  );
  if (!json.data?.dm_event_id) throw upstreamFailed("X accepted the DM but returned no event id");
  return { eventId: json.data.dm_event_id, conversationId: json.data.dm_conversation_id };
}

export async function getUserByHandle(token: string, handle: string): Promise<XUser> {
  const clean = handle.replace(/^@/, "").trim();
  const json = await xFetch<{ data?: XUser }>(
    token,
    `/users/by/username/${encodeURIComponent(clean)}`,
  );
  if (!json.data?.id) throw badRequest(`could not find @${clean} on X`);
  return json.data;
}

export interface XDmEvent {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
}

/** Recent message events in the 1:1 DM conversation with a participant (needs dm.read). */
export async function listDmEventsWith(
  token: string,
  participantId: string,
  limit = 50,
): Promise<XDmEvent[]> {
  const qs = new URLSearchParams({
    "dm_event.fields": "id,text,sender_id,created_at,event_type",
    event_types: "MessageCreate",
    max_results: String(limit),
  });
  const json = await xFetch<{
    data?: { id: string; text?: string; sender_id?: string; created_at?: string }[];
  }>(token, `/dm_conversations/with/${participantId}/dm_events?${qs}`);
  return (json.data ?? [])
    .filter((e) => e.sender_id && e.text)
    .map((e) => ({
      id: e.id,
      text: e.text!,
      senderId: e.sender_id!,
      createdAt: e.created_at ?? new Date().toISOString(),
    }));
}
