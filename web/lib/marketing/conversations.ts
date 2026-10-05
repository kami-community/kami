import type { Db } from "@/lib/db/client";
import { AppError, notFound } from "@/lib/http/errors";

/** Marketing DM conversations (X leads and Instagram creators) for one campaign. */

export async function listConversations(db: Db, sessionId: string) {
  const { data, error } = await db
    .from("marketing_conversations")
    .select("*, marketing_crm!inner(session_id, handle, platform)")
    .eq("marketing_crm.session_id", sessionId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new AppError("internal", error.message);
  return data ?? [];
}

async function assertInSession(db: Db, sessionId: string, conversationId: string) {
  const { data, error } = await db
    .from("marketing_conversations")
    .select("id, marketing_crm!inner(session_id)")
    .eq("id", conversationId)
    .eq("marketing_crm.session_id", sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("conversation not found for this campaign");
}

export async function listMessages(db: Db, sessionId: string, conversationId: string) {
  await assertInSession(db, sessionId, conversationId);
  const { data, error } = await db
    .from("marketing_conversation_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });
  if (error) throw new AppError("internal", error.message);
  return data ?? [];
}

export type EscalationDecision = "approve" | "counter" | "decline";

/** Founder's decision on an escalated negotiation. */
export async function resolveEscalation(
  db: Db,
  params: { sessionId: string; conversationId: string; decision: EscalationDecision },
): Promise<string> {
  await assertInSession(db, params.sessionId, params.conversationId);
  const status = params.decision === "decline" ? "concluded" : "awaiting_reply";
  const { error } = await db
    .from("marketing_conversations")
    .update({ status, escalation_reason: null, updated_at: new Date().toISOString() })
    .eq("id", params.conversationId);
  if (error) throw new AppError("internal", error.message);
  return status;
}
