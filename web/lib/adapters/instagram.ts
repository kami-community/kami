import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError, badRequest, upstreamFailed } from "@/lib/http/errors";

/**
 * Instagram API with Instagram Login (professional accounts).
 * https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 */

export const GRAPH = "https://graph.instagram.com";
export const GRAPH_VERSION = "v21.0";

interface GraphError {
  error?: { message?: string; code?: number };
}

export interface IgDirectMessage {
  messageId: string;
}

/**
 * Send a DM from the connected professional account. Instagram usually requires
 * the recipient to have interacted with the account first; the API error is
 * surfaced as-is so the founder knows why a cold DM was refused.
 */
export async function sendDirectMessage(params: {
  accessToken: string;
  senderUserId: string;
  recipientHandle: string;
  text: string;
}): Promise<IgDirectMessage> {
  const text = params.text.trim();
  const handle = params.recipientHandle.replace(/^@/, "").trim();
  if (!text) throw badRequest("message text required");
  if (!handle) throw badRequest("recipient handle required");

  const res = await fetch(`${GRAPH}/${GRAPH_VERSION}/${params.senderUserId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { username: handle }, message: { text } }),
  });
  const json = (await res.json().catch(() => ({}))) as GraphError & { message_id?: string };
  if (!res.ok) {
    const message = json.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 403 || json.error?.code === 10) {
      throw new AppError(
        "forbidden",
        `Instagram refused the DM: ${message}. Cold DMs need messaging permission and usually a prior interaction.`,
      );
    }
    throw upstreamFailed(`Instagram API error: ${message}`, { provider_status: res.status });
  }
  if (!json.message_id)
    throw upstreamFailed("Instagram accepted the DM but returned no message id");
  return { messageId: json.message_id };
}

export async function getProfile(accessToken: string): Promise<{ id: string; username: string }> {
  const qs = new URLSearchParams({ fields: "user_id,username", access_token: accessToken });
  const res = await fetch(`${GRAPH}/me?${qs}`);
  const json = (await res.json().catch(() => ({}))) as GraphError & {
    user_id?: string;
    id?: string;
    username?: string;
  };
  if (!res.ok || !json.username) {
    throw upstreamFailed(json.error?.message ?? "could not read the connected Instagram profile");
  }
  return { id: String(json.user_id ?? json.id ?? ""), username: json.username };
}

/** Verify Meta's `X-Hub-Signature-256: sha256=<hex>` header over the raw body. */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = header?.startsWith("sha256=") ? header.slice(7) : "";
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Username of a messaging sender (Instagram-scoped id), via the account's token. */
export async function getSenderUsername(
  accessToken: string,
  senderId: string,
): Promise<string | null> {
  const qs = new URLSearchParams({ fields: "username", access_token: accessToken });
  const res = await fetch(`${GRAPH}/${GRAPH_VERSION}/${senderId}?${qs}`);
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { username?: string };
  return json.username ?? null;
}

export interface IgMessagingEvent {
  accountId: string;
  senderId: string;
  messageId: string;
  text: string;
  timestamp: number;
}

/** Inbound text messages from a webhook payload (echoes of our own messages are skipped). */
export function parseMessagingEvents(payload: unknown): IgMessagingEvent[] {
  const body = payload as {
    object?: string;
    entry?: {
      id?: string;
      messaging?: {
        sender?: { id?: string };
        timestamp?: number;
        message?: { mid?: string; text?: string; is_echo?: boolean };
      }[];
    }[];
  };
  if (body?.object !== "instagram") return [];
  const events: IgMessagingEvent[] = [];
  for (const entry of body.entry ?? []) {
    for (const m of entry.messaging ?? []) {
      if (!entry.id || !m.sender?.id || !m.message?.mid || !m.message.text || m.message.is_echo)
        continue;
      events.push({
        accountId: entry.id,
        senderId: m.sender.id,
        messageId: m.message.mid,
        text: m.message.text,
        timestamp: m.timestamp ?? Date.now(),
      });
    }
  }
  return events;
}
