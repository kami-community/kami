import { db } from "@/lib/db/client";
import { route } from "@/lib/http/route";
import { ingestInboundEmail } from "@/lib/inbound/salesReplies";
import { emailProvider } from "@/lib/providers";

/**
 * AgentMail webhook (event `message.received`). Public path: authenticity is
 * proven by the Svix signature, verified against AGENTMAIL_WEBHOOK_SECRET.
 */
export const POST = route(async (request) => {
  const rawBody = await request.text();
  const messages = await emailProvider().parseWebhook(rawBody, request.headers);
  let recorded = 0;
  for (const message of messages) {
    const result = await ingestInboundEmail(db(), message);
    if (result && !result.duplicate) recorded++;
  }
  return Response.json({ received: messages.length, recorded });
});
