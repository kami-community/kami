import { supabaseServer } from "@/lib/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const sb = supabaseServer();
  if (!sb) return Response.json({ messages: [] });

  const { data: messages } = await sb
    .from("marketing_conversation_messages")
    .select("*")
    .eq("conversation_id", id)
    .order("sent_at", { ascending: true });

  return Response.json({ messages: messages ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { action, content } = await request.json();

  if (action === "send" && content) {
    await sb.from("marketing_conversation_messages").insert({
      conversation_id: id,
      sender: "kami",
      content,
      status: "sent",
    });
    await sb
      .from("marketing_conversations")
      .update({ status: "response_sent", updated_at: new Date().toISOString() })
      .eq("id", id);
    return Response.json({ sent: true });
  }

  if (action === "approve" || action === "counter" || action === "decline") {
    const newStatus = action === "decline" ? "concluded" : "awaiting_reply";
    await sb
      .from("marketing_conversations")
      .update({
        status: newStatus,
        escalation_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return Response.json({ resolved: true, status: newStatus });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}
