import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import { listMessages, resolveEscalation } from "@/lib/marketing/conversations";
import { suggestDm } from "@/lib/marketing/dmSuggestions";
import { sendConversationMessage } from "@/lib/outbound/marketingDm";

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
  z.object({ action: z.literal("suggest"), session_id: ids.sessionId }),
  z.object({
    action: z.literal("resolve"),
    session_id: ids.sessionId,
    decision: z.enum(["approve", "counter", "decline"]),
  }),
]);

export const GET = route<Ctx>(async (request, { params }) => {
  const { id } = Params.parse(await params);
  const { session_id } = parseQuery(request, Query);
  return Response.json({ messages: await listMessages(db(), session_id, id) });
});

export const POST = route<Ctx>(async (request, { params }) => {
  const { id } = Params.parse(await params);
  const body = await parseBody(request, Body);
  if (body.action === "reply") {
    const { receipt, account } = await sendConversationMessage(db(), {
      sessionId: body.session_id,
      conversationId: id,
      text: body.content,
      clientMessageId: body.client_message_id,
    });
    return Response.json({ sent: true, account, receipt });
  }
  if (body.action === "suggest") {
    return Response.json(await suggestDm(db(), { sessionId: body.session_id, conversationId: id }));
  }
  const status = await resolveEscalation(db(), {
    sessionId: body.session_id,
    conversationId: id,
    decision: body.decision,
  });
  return Response.json({ resolved: true, status });
});
