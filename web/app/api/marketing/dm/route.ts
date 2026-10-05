import { supabaseServer } from "@/lib/supabase";
import { resolveXAccess } from "@/lib/xCreds";
import { getValidIgAccessToken } from "@/lib/igOauth";
import { sendXDirectMessage } from "@/lib/xDm";
import { sendIgDirectMessage } from "@/lib/igDm";

export const maxDuration = 60;

/**
 * Send a cold DM as the session's connected user account (X or Instagram).
 * Body: { session_id, crm_entry_id, body?, goal? }
 */
export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const {
    session_id,
    crm_entry_id,
    body: messageBody,
    goal,
  } = (await request.json()) as {
    session_id?: string;
    crm_entry_id?: string;
    body?: string;
    goal?: string;
  };

  if (!session_id || !crm_entry_id) {
    return Response.json({ error: "session_id and crm_entry_id required" }, { status: 400 });
  }

  const { data: config } = await sb
    .from("marketing_config")
    .select("autonomous_paused, tone, x_outreach_goal, ig_offer_min, ig_offer_max")
    .eq("session_id", session_id)
    .maybeSingle();

  if (config?.autonomous_paused) {
    return Response.json({ error: "marketing is paused", paused: true }, { status: 423 });
  }

  const { data: entry, error: entryErr } = await sb
    .from("marketing_crm")
    .select("*")
    .eq("id", crm_entry_id)
    .eq("session_id", session_id)
    .maybeSingle();

  if (entryErr) return Response.json({ error: entryErr.message }, { status: 500 });
  if (!entry)
    return Response.json({ error: "CRM entry not found for this session" }, { status: 404 });

  const text =
    (messageBody && messageBody.trim()) ||
    defaultOpener({
      handle: entry.handle,
      type: entry.type,
      reasoning: entry.relevance_reasoning,
      offer: entry.offer_amount,
    });

  const convGoal =
    goal ??
    (entry.type === "creator"
      ? "negotiate_collab"
      : config?.x_outreach_goal === "book_demo"
        ? "book_demo"
        : "drive_signup");

  // Upsert conversation row
  let conversationId: string;
  const { data: existingConv } = await sb
    .from("marketing_conversations")
    .select("id")
    .eq("crm_entry_id", entry.id)
    .maybeSingle();

  if (existingConv) {
    conversationId = existingConv.id;
  } else {
    const { data: created, error: convErr } = await sb
      .from("marketing_conversations")
      .insert({
        crm_entry_id: entry.id,
        platform: entry.platform,
        goal: convGoal,
        budget_min: config?.ig_offer_min ?? null,
        budget_max: config?.ig_offer_max ?? null,
        status: "first_msg_drafted",
      })
      .select("id")
      .single();
    if (convErr || !created) {
      return Response.json(
        { error: convErr?.message ?? "could not create conversation" },
        { status: 500 },
      );
    }
    conversationId = created.id;
  }

  try {
    let platformMessageId: string | undefined;
    let sentAs: string;

    if (entry.platform === "x") {
      const access = await resolveXAccess({ sessionId: session_id });
      if (!access) {
        return Response.json(
          {
            error:
              "No X account connected for this session — Log in with X, then re-launch the campaign",
          },
          { status: 503 },
        );
      }
      const receipt = await sendXDirectMessage({
        accessToken: access.token,
        recipientUsername: entry.handle,
        text,
      });
      platformMessageId = receipt.dm_event_id;
      sentAs = access.handle;
    } else if (entry.platform === "instagram") {
      const access = await getValidIgAccessToken({ sessionId: session_id });
      if (!access?.userId) {
        return Response.json(
          {
            error:
              "No Instagram account connected for this session — Log in with Instagram, then re-launch the campaign",
          },
          { status: 503 },
        );
      }
      const receipt = await sendIgDirectMessage({
        accessToken: access.token,
        igUserId: access.userId,
        recipientUsername: entry.handle,
        text,
      });
      platformMessageId = receipt.message_id;
      sentAs = access.handle;
    } else {
      return Response.json({ error: `unsupported platform ${entry.platform}` }, { status: 400 });
    }

    await sb.from("marketing_conversation_messages").insert({
      conversation_id: conversationId,
      sender: "kami",
      content: text,
      platform_message_id: platformMessageId ?? null,
      status: "sent",
    });

    await sb
      .from("marketing_conversations")
      .update({ status: "first_msg_sent", updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    await sb
      .from("marketing_crm")
      .update({
        status: entry.type === "creator" ? "contacted" : "contacted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", entry.id);

    return Response.json({
      sent: true,
      conversation_id: conversationId,
      account: sentAs,
      platform: entry.platform,
      handle: entry.handle,
      platform_message_id: platformMessageId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DM send failed";
    await sb.from("marketing_conversation_messages").insert({
      conversation_id: conversationId,
      sender: "kami",
      content: text,
      status: "failed",
    });
    await sb
      .from("marketing_conversations")
      .update({ status: "escalated", escalation_reason: msg, updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    const status = /403|access|tier|permission/i.test(msg) ? 403 : 502;
    return Response.json({ error: msg, conversation_id: conversationId }, { status });
  }
}

function defaultOpener(params: {
  handle: string;
  type: string;
  reasoning?: string | null;
  offer?: number | null;
}): string {
  const name = params.handle.replace(/^@/, "");
  if (params.type === "creator") {
    const offer = params.offer != null ? ` We usually work in the $${params.offer} range.` : "";
    return `Hey ${name} — loved your recent work. Open to a quick collab?${offer}`;
  }
  const why = params.reasoning ? ` ${params.reasoning.slice(0, 80)}` : "";
  return `Hey ${name} — saw your recent posts.${why} Curious if this is useful for you?`;
}
