import { supabaseServer } from "@/lib/supabase";
import { classifyReplyContent } from "@/lib/salesClassify";
import type { ReplyClassificationLabel, SalesMessage } from "@/lib/salesTypes";

function rowToMessage(row: Record<string, unknown>): SalesMessage {
  return {
    id: row.id as string,
    conversation_id: row.conversation_id as string,
    direction: row.direction as "inbound" | "outbound",
    content: row.content as string,
    provider_message_id: row.provider_message_id as string | undefined,
    classification_id: row.classification_id as string | undefined,
    sent_at: row.sent_at as string | undefined,
    created_at: row.created_at as string | undefined,
  };
}

async function handleUnsubscribe(
  sb: NonNullable<ReturnType<typeof supabaseServer>>,
  sessionId: string,
  conversationId: string,
  accountId: string | null,
  contactId: string | null,
): Promise<void> {
  let identifier = "";
  if (contactId) {
    const { data: contact } = await sb
      .from("sales_contacts")
      .select("email, handle")
      .eq("id", contactId)
      .maybeSingle();
    identifier = (contact?.email ?? contact?.handle ?? "").trim().toLowerCase();
  }

  if (identifier) {
    await sb.from("sales_suppression_entries").upsert(
      {
        session_id: sessionId,
        channel: "email",
        identifier,
        reason: "unsubscribe reply",
        source: "reply_classification",
        actor: "user",
      },
      { onConflict: "session_id,identifier,channel", ignoreDuplicates: true },
    );
  }

  if (accountId) {
    await sb
      .from("sales_accounts")
      .update({ pipeline_stage: "suppressed", updated_at: new Date().toISOString() })
      .eq("id", accountId);
  }

  await sb
    .from("sales_conversations")
    .update({ status: "suppressed", updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const sb = supabaseServer();
  if (!sb) return Response.json({ messages: [], classifications: [] });

  const { data: conversation } = await sb
    .from("sales_conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) return Response.json({ error: "not found" }, { status: 404 });

  const { data: messages } = await sb
    .from("sales_conversation_messages")
    .select("*")
    .eq("conversation_id", id)
    .order("sent_at", { ascending: true });

  const messageIds = (messages ?? []).map((m) => m.id);
  let classifications: Record<string, unknown>[] = [];
  if (messageIds.length > 0) {
    const { data: cls } = await sb
      .from("sales_reply_classifications")
      .select("*")
      .in("message_id", messageIds);
    classifications = cls ?? [];
  }

  const clsByMessage: Record<string, Record<string, unknown>> = {};
  for (const c of classifications) clsByMessage[c.message_id as string] = c;

  return Response.json({
    conversation,
    messages: (messages ?? []).map((m) => ({
      ...rowToMessage(m),
      classification: clsByMessage[m.id] ?? null,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: conversation } = await sb
    .from("sales_conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) return Response.json({ error: "not found" }, { status: 404 });

  const body = await request.json();
  const { action } = body;

  if (action === "message") {
    const content = (body.content as string)?.trim();
    if (!content) return Response.json({ error: "content required" }, { status: 400 });

    const now = new Date().toISOString();
    const { data: msg, error } = await sb
      .from("sales_conversation_messages")
      .insert({ conversation_id: id, direction: "outbound", content, sent_at: now })
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    await sb
      .from("sales_conversations")
      .update({ status: "awaiting_reply", last_message_at: now, updated_at: now })
      .eq("id", id);
    return Response.json({ sent: true, message: rowToMessage(msg) });
  }

  if (action === "classify") {
    const messageId = body.message_id as string;
    if (!messageId) return Response.json({ error: "message_id required" }, { status: 400 });

    const { data: message } = await sb
      .from("sales_conversation_messages")
      .select("*")
      .eq("id", messageId)
      .eq("conversation_id", id)
      .maybeSingle();

    if (!message) return Response.json({ error: "message not found" }, { status: 404 });

    let label = body.label as ReplyClassificationLabel | undefined;
    let confidence = body.confidence as number | undefined;
    let escalationRequired = body.escalation_required as boolean | undefined;
    let draftResponse = body.draft_response as string | undefined;

    if (!label) {
      const auto = classifyReplyContent(message.content);
      label = auto.label;
      confidence = auto.confidence;
      escalationRequired = auto.escalation_required;
      draftResponse = auto.draft_response;
    }

    const { data: classification, error: clsErr } = await sb
      .from("sales_reply_classifications")
      .insert({
        session_id: conversation.session_id,
        message_id: messageId,
        label,
        confidence: confidence ?? null,
        escalation_required: escalationRequired ?? false,
        draft_response: draftResponse ?? null,
      })
      .select("*")
      .single();

    if (clsErr) return Response.json({ error: clsErr.message }, { status: 500 });

    await sb
      .from("sales_conversation_messages")
      .update({ classification_id: classification.id })
      .eq("id", messageId);

    const notifKind = escalationRequired ? "escalation" : "reply";
    await sb.from("sales_notifications").insert({
      session_id: conversation.session_id,
      kind: notifKind,
      title: `${label.replace(/_/g, " ")} reply`,
      body: message.content.slice(0, 200),
      entity_type: "sales_conversation",
      entity_id: id,
    });

    if (label === "unsubscribe") {
      await handleUnsubscribe(
        sb,
        conversation.session_id,
        id,
        conversation.account_id,
        conversation.contact_id,
      );
    }

    if (conversation.account_id && label === "positive") {
      await sb
        .from("sales_accounts")
        .update({ pipeline_stage: "engaged", updated_at: new Date().toISOString() })
        .eq("id", conversation.account_id)
        .eq("pipeline_stage", "sent");
    }

    return Response.json({ classified: true, classification });
  }

  if (action === "escalate") {
    const reason = (body.reason as string) ?? "Manual escalation";
    await sb.from("sales_notifications").insert({
      session_id: conversation.session_id,
      kind: "escalation",
      title: "Escalated conversation",
      body: reason,
      entity_type: "sales_conversation",
      entity_id: id,
    });
    await sb
      .from("sales_conversations")
      .update({ status: "escalated", updated_at: new Date().toISOString() })
      .eq("id", id);
    return Response.json({ escalated: true });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
