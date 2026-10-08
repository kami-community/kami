import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { sendSalesConversationReply } from "@/lib/outbound/salesReply";
import { emailProvider } from "@/lib/providers";
import { classifyMessage, escalateConversation, getThread } from "@/lib/sales/conversations";
import { REPLY_CLASSIFICATION_LABELS } from "@/lib/salesTypes";

type Ctx = { params: Promise<{ id: string }> };
const Params = z.object({ id: ids.uuid });
const Query = z.object({ session_id: ids.sessionId });

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reply"),
    session_id: ids.sessionId,
    content: z.string().min(1).max(10_000),
    client_message_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("classify"),
    session_id: ids.sessionId,
    message_id: ids.uuid,
    label: z.enum(REPLY_CLASSIFICATION_LABELS).optional(),
  }),
  z.object({
    action: z.literal("escalate"),
    session_id: ids.sessionId,
    reason: z.string().max(500).default("Manual review requested"),
  }),
]);

export const GET = route<Ctx>(async (request, { params }) => {
  const { id } = Params.parse(await params);
  const { session_id } = parseQuery(request, Query);
  return Response.json(await getThread(db(), session_id, id));
});

export const POST = route<Ctx>(async (request, { params }) => {
  const { id } = Params.parse(await params);
  const body = await parseBody(request, Body);
  switch (body.action) {
    case "reply": {
      const receipt = await sendSalesConversationReply(db(), emailProvider(), {
        sessionId: body.session_id,
        conversationId: id,
        content: body.content,
        clientMessageId: body.client_message_id,
      });
      return Response.json({ sent: true, receipt });
    }
    case "classify": {
      const classification = await classifyMessage(db(), {
        sessionId: body.session_id,
        conversationId: id,
        messageId: body.message_id,
        label: body.label,
      });
      return Response.json({ classified: true, classification });
    }
    case "escalate":
      await escalateConversation(db(), {
        sessionId: body.session_id,
        conversationId: id,
        reason: body.reason,
      });
      return Response.json({ escalated: true });
  }
});
