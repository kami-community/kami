import { getSenderUsername, type IgMessagingEvent } from "@/lib/adapters/instagram";
import { getUserByHandle, listDmEventsWith } from "@/lib/adapters/x/api";
import { requireConnection, type Connection } from "@/lib/connections/service";
import type { Db } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";

/**
 * Inbound side of marketing DMs. X replies are polled (dm.read); Instagram
 * replies arrive through the Meta webhook. Either way a reply is stored once
 * and the conversation waits for the founder ("needs_review") — Kami does not
 * answer on its own.
 */

const ACTIVE = ["first_msg_sent", "awaiting_reply", "response_sent"];
const STALL_AFTER_DAYS = 3;

interface ActiveConversation {
  id: string;
  status: string;
  platform: "x" | "instagram";
  marketing_crm: { session_id: string; handle: string };
}

/** Store an inbound DM unless it was already recorded. Returns true when new. */
export async function recordLeadMessage(
  db: Db,
  params: { conversationId: string; platformMessageId: string; text: string; sentAt: string },
): Promise<boolean> {
  const { data: seen } = await db
    .from("marketing_conversation_messages")
    .select("id")
    .eq("conversation_id", params.conversationId)
    .eq("platform_message_id", params.platformMessageId)
    .maybeSingle();
  if (seen) return false;

  const { error } = await db.from("marketing_conversation_messages").insert({
    conversation_id: params.conversationId,
    sender: "lead",
    content: params.text,
    platform_message_id: params.platformMessageId,
    status: "received",
    sent_at: params.sentAt,
  });
  if (error) throw new AppError("internal", error.message);
  await db
    .from("marketing_conversations")
    .update({ status: "needs_review", updated_at: new Date().toISOString() })
    .eq("id", params.conversationId);
  return true;
}

async function pausedSessions(db: Db, sessionIds: string[]): Promise<Set<string>> {
  if (!sessionIds.length) return new Set();
  const [sessions, configs] = await Promise.all([
    db.from("agent_sessions").select("id").in("id", sessionIds).eq("paused", true),
    db
      .from("marketing_config")
      .select("session_id")
      .in("session_id", sessionIds)
      .eq("autonomous_paused", true),
  ]);
  return new Set([
    ...(sessions.data ?? []).map((r) => r.id as string),
    ...(configs.data ?? []).map((r) => r.session_id as string),
  ]);
}

async function markStalled(db: Db, conversation: ActiveConversation): Promise<boolean> {
  if (conversation.status !== "awaiting_reply" && conversation.status !== "first_msg_sent")
    return false;
  const { data: last } = await db
    .from("marketing_conversation_messages")
    .select("sender, sent_at")
    .eq("conversation_id", conversation.id)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last?.sender !== "kami") return false;
  const days = (Date.now() - new Date(last.sent_at).getTime()) / 86_400_000;
  if (days <= STALL_AFTER_DAYS) return false;
  await db
    .from("marketing_conversations")
    .update({ status: "stalled", updated_at: new Date().toISOString() })
    .eq("id", conversation.id);
  return true;
}

/** Job: check active X DM conversations for replies and flag stalled ones. */
export async function pollMarketingReplies(db: Db) {
  const { data, error } = await db
    .from("marketing_conversations")
    .select("id, status, platform, marketing_crm!inner(session_id, handle)")
    .in("status", ACTIVE);
  if (error) throw new AppError("internal", error.message);
  const conversations = (data ?? []) as unknown as ActiveConversation[];

  const paused = await pausedSessions(db, [
    ...new Set(conversations.map((c) => c.marketing_crm.session_id)),
  ]);
  const connections = new Map<string, Connection | null>();
  const result = { checked: 0, replies: 0, stalled: 0, skipped_paused: 0, errors: [] as string[] };

  for (const conversation of conversations) {
    const sessionId = conversation.marketing_crm.session_id;
    if (paused.has(sessionId)) {
      result.skipped_paused++;
      continue;
    }
    result.checked++;

    if (conversation.platform === "x") {
      if (!connections.has(sessionId)) {
        connections.set(sessionId, await requireConnection(db, sessionId, "x").catch(() => null));
      }
      const account = connections.get(sessionId);
      if (account) {
        try {
          const lead = await getUserByHandle(
            account.accessToken,
            conversation.marketing_crm.handle,
          );
          for (const event of await listDmEventsWith(account.accessToken, lead.id)) {
            if (event.senderId !== lead.id) continue;
            const isNew = await recordLeadMessage(db, {
              conversationId: conversation.id,
              platformMessageId: event.id,
              text: event.text,
              sentAt: event.createdAt,
            });
            if (isNew) result.replies++;
          }
        } catch (err) {
          result.errors.push(
            `@${conversation.marketing_crm.handle}: ${err instanceof Error ? err.message : "failed"}`,
          );
        }
      }
    }

    if (await markStalled(db, conversation)) result.stalled++;
  }
  return result;
}

/** Record Instagram DM replies delivered by the Meta webhook. */
export async function ingestInstagramMessages(
  db: Db,
  events: IgMessagingEvent[],
): Promise<{ received: number; recorded: number }> {
  let recorded = 0;
  for (const event of events) {
    const { data: account } = await db
      .from("connected_accounts")
      .select("session_id")
      .eq("platform", "instagram")
      .eq("external_user_id", event.accountId)
      .maybeSingle();
    if (!account) continue;

    const connection = await requireConnection(db, account.session_id, "instagram").catch(
      () => null,
    );
    const username = connection
      ? await getSenderUsername(connection.accessToken, event.senderId)
      : null;
    if (!username) continue;

    const { data: conversation } = await db
      .from("marketing_conversations")
      .select("id, marketing_crm!inner(session_id, handle, platform)")
      .eq("marketing_crm.session_id", account.session_id)
      .eq("marketing_crm.platform", "instagram")
      .ilike("marketing_crm.handle", username.replace(/^@/, ""))
      .maybeSingle();
    if (!conversation) continue;

    const isNew = await recordLeadMessage(db, {
      conversationId: conversation.id,
      platformMessageId: event.messageId,
      text: event.text,
      sentAt: new Date(event.timestamp).toISOString(),
    });
    if (isNew) recorded++;
  }
  return { received: events.length, recorded };
}
