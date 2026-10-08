import { parseMessagingEvents, verifyWebhookSignature } from "@/lib/adapters/instagram";
import { safeEqual } from "@/lib/auth/access";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db/client";
import { AppError, notConfigured } from "@/lib/http/errors";
import { route } from "@/lib/http/route";
import { ingestInstagramMessages } from "@/lib/marketing/conversationReplies";

/**
 * Meta webhook for Instagram messaging. Public path: GET is the subscription
 * handshake (verify token); POST is authenticated by X-Hub-Signature-256.
 */
export const GET = route(async (request) => {
  const params = new URL(request.url).searchParams;
  const token = env().INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  if (!token) throw notConfigured("INSTAGRAM_WEBHOOK_VERIFY_TOKEN is not set");
  if (
    params.get("hub.mode") !== "subscribe" ||
    !safeEqual(params.get("hub.verify_token") ?? "", token)
  ) {
    throw new AppError("forbidden", "verification failed");
  }
  return new Response(params.get("hub.challenge") ?? "", {
    headers: { "Content-Type": "text/plain" },
  });
});

export const POST = route(async (request) => {
  const secret = env().INSTAGRAM_APP_SECRET;
  if (!secret) throw notConfigured("INSTAGRAM_APP_SECRET is not set");
  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), secret)) {
    throw new AppError("unauthorized", "invalid webhook signature");
  }
  const events = parseMessagingEvents(JSON.parse(rawBody));
  return Response.json(await ingestInstagramMessages(db(), events));
});
