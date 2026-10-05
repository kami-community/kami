import { supabaseServer } from "@/lib/supabase";

// Cron: poll all active conversations for new replies.
// Call on a schedule (e.g. every 60s) from a local scheduler.
export async function POST(): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: active } = await sb
    .from("marketing_conversations")
    .select("id, crm_entry_id, platform, goal, persona_config, budget_min, budget_max, status, marketing_crm!inner(session_id)")
    .in("status", ["awaiting_reply", "first_msg_sent"]);

  if (!active?.length) return Response.json({ checked: 0, replies: 0, skipped_paused: 0 });

  const sessionIds = [
    ...new Set(
      active
        .map((conv) => {
          const crm = conv.marketing_crm as { session_id?: string } | { session_id?: string }[];
          return Array.isArray(crm) ? crm[0]?.session_id : crm?.session_id;
        })
        .filter(Boolean),
    ),
  ] as string[];

  const pausedSessions = new Set<string>();
  if (sessionIds.length) {
    const { data: configs } = await sb
      .from("marketing_config")
      .select("session_id, autonomous_paused")
      .in("session_id", sessionIds)
      .eq("autonomous_paused", true);
    for (const cfg of configs ?? []) {
      pausedSessions.add(cfg.session_id);
    }
  }

  const replies = 0;
  let skippedPaused = 0;

  for (const conv of active) {
    const crm = conv.marketing_crm as { session_id?: string } | { session_id?: string }[];
    const sessionId = Array.isArray(crm) ? crm[0]?.session_id : crm?.session_id;
    if (sessionId && pausedSessions.has(sessionId)) {
      skippedPaused++;
      continue;
    }

    // ponytail: platform-specific reply checking deferred.
    // Real path: X API search for conversation replies, IG Messaging API for inbox.
    // When wired, each reply triggers conversation-agent via Hermes gateway.

    const { data: lastMsg } = await sb
      .from("marketing_conversation_messages")
      .select("sent_at, sender")
      .eq("conversation_id", conv.id)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastMsg?.sender === "kami") {
      const daysSince = (Date.now() - new Date(lastMsg.sent_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 3 && conv.status === "awaiting_reply") {
        await sb
          .from("marketing_conversations")
          .update({ status: "stalled", updated_at: new Date().toISOString() })
          .eq("id", conv.id);
      }
    }
  }

  return Response.json({ checked: active.length, replies, skipped_paused: skippedPaused });
}
