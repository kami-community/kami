import { supabaseServer } from "@/lib/supabase";
import { classifyReplyContent } from "@/lib/salesClassify";

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const body = await request.json();
  const {
    session_id,
    conversation_id,
    account_id: bodyAccountId,
    contact_id,
    from_email,
    content,
    provider_message_id,
    subject,
  } = body as {
    session_id: string;
    conversation_id?: string;
    account_id?: string;
    contact_id?: string;
    from_email?: string;
    content: string;
    provider_message_id?: string;
    subject?: string;
  };

  let account_id = bodyAccountId;

  if (!session_id || !content?.trim()) {
    return Response.json({ error: "session_id and content required" }, { status: 400 });
  }

  const normalized = content.trim();
  const now = new Date().toISOString();
  let convId = conversation_id;

  if (!convId) {
    let resolvedContactId = contact_id;
    if (!resolvedContactId && from_email) {
      const { data: contact } = await sb
        .from("sales_contacts")
        .select("id, account_id")
        .eq("session_id", session_id)
        .ilike("email", from_email.trim())
        .maybeSingle();
      resolvedContactId = contact?.id;
      if (!account_id && contact?.account_id) account_id = contact.account_id;
    }

    const { data: conv, error: convErr } = await sb
      .from("sales_conversations")
      .insert({
        session_id,
        account_id: account_id ?? null,
        contact_id: resolvedContactId ?? null,
        channel: "email",
        status: "open",
        last_message_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (convErr) return Response.json({ error: convErr.message }, { status: 500 });
    convId = conv.id;
  }

  const messageContent = subject ? `Subject: ${subject}\n\n${normalized}` : normalized;

  const { data: message, error: msgErr } = await sb
    .from("sales_conversation_messages")
    .insert({
      conversation_id: convId,
      direction: "inbound",
      content: messageContent,
      provider_message_id: provider_message_id ?? null,
      sent_at: now,
    })
    .select("*")
    .single();

  if (msgErr) return Response.json({ error: msgErr.message }, { status: 500 });

  await sb
    .from("sales_conversations")
    .update({ status: "needs_review", last_message_at: now, updated_at: now })
    .eq("id", convId);

  const classification = classifyReplyContent(normalized);
  const { data: cls, error: clsErr } = await sb
    .from("sales_reply_classifications")
    .insert({
      session_id,
      message_id: message.id,
      label: classification.label,
      confidence: classification.confidence,
      escalation_required: classification.escalation_required,
      draft_response: classification.draft_response ?? null,
    })
    .select("*")
    .single();

  if (clsErr) return Response.json({ error: clsErr.message }, { status: 500 });

  await sb
    .from("sales_conversation_messages")
    .update({ classification_id: cls.id })
    .eq("id", message.id);

  const notifKind = classification.escalation_required ? "escalation" : "reply";
  await sb.from("sales_notifications").insert({
    session_id,
    kind: notifKind,
    title: `Inbound: ${classification.label.replace(/_/g, " ")}`,
    body: normalized.slice(0, 200),
    entity_type: "sales_conversation",
    entity_id: convId,
  });

  if (classification.label === "unsubscribe") {
    const identifier = from_email?.trim().toLowerCase();
    if (identifier) {
      await sb.from("sales_suppression_entries").upsert(
        {
          session_id,
          channel: "email",
          identifier,
          reason: "unsubscribe reply",
          source: "reply_ingest",
          actor: "system",
        },
        { onConflict: "session_id,identifier,channel", ignoreDuplicates: true },
      );
    }
    if (account_id) {
      await sb
        .from("sales_accounts")
        .update({ pipeline_stage: "suppressed", updated_at: now })
        .eq("id", account_id);
    }
  }

  return Response.json({
    ingested: true,
    conversation_id: convId,
    message,
    classification: cls,
  });
}
