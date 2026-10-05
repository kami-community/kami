import { Webhook } from "svix";
import {
  bareAddress,
  type EmailProvider,
  type EmailSendReceipt,
  type InboundEmail,
} from "@/lib/ports/email";
import { AppError, upstreamFailed } from "@/lib/http/errors";

const API = "https://api.agentmail.to/v0";

interface AgentMailMessage {
  message_id: string;
  thread_id?: string;
  labels?: string[];
  from: string;
  subject?: string;
  text?: string;
  preview?: string;
  timestamp?: string;
  created_at?: string;
}

function toInbound(m: AgentMailMessage): InboundEmail {
  return {
    provider: "agentmail",
    messageId: m.message_id,
    threadId: m.thread_id,
    from: bareAddress(m.from),
    subject: m.subject ?? "",
    text: m.text ?? m.preview ?? "",
    receivedAt: m.timestamp ?? m.created_at ?? new Date().toISOString(),
  };
}

export interface AgentMailConfig {
  apiKey: string;
  inbox: string;
  webhookSecret?: string;
}

export function createAgentMailProvider(config: AgentMailConfig): EmailProvider {
  const inboxPath = `${API}/inboxes/${encodeURIComponent(config.inbox)}`;
  const auth = { Authorization: `Bearer ${config.apiKey}` };

  /** Sends are idempotent per key: a retry returns the original ids and sends nothing new. */
  async function post(
    url: string,
    body: unknown,
    idempotencyKey: string,
  ): Promise<EmailSendReceipt> {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      message_id?: string;
      thread_id?: string;
    };
    if (!res.ok) {
      throw upstreamFailed(`AgentMail send failed (HTTP ${res.status})`, {
        provider_status: res.status,
        provider_body: JSON.stringify(json).slice(0, 300),
      });
    }
    if (!json.message_id)
      throw upstreamFailed("AgentMail accepted the send but returned no message_id");
    return {
      provider: "agentmail",
      messageId: json.message_id,
      threadId: json.thread_id,
      from: config.inbox,
    };
  }

  return {
    id: "agentmail",
    from: config.inbox,

    send(email, { idempotencyKey }) {
      return post(
        `${inboxPath}/messages/send`,
        { to: [email.to], subject: email.subject, text: email.text },
        idempotencyKey,
      );
    },

    reply({ inReplyToMessageId, text }, { idempotencyKey }) {
      return post(
        `${inboxPath}/messages/${encodeURIComponent(inReplyToMessageId)}/reply`,
        { text },
        idempotencyKey,
      );
    },

    async listInbound({ limit }) {
      const res = await fetch(`${inboxPath}/messages?limit=${limit}`, { headers: auth });
      if (!res.ok) throw upstreamFailed(`AgentMail list failed (HTTP ${res.status})`);
      const json = (await res.json()) as { messages?: AgentMailMessage[] };
      return (json.messages ?? []).filter((m) => m.labels?.includes("received")).map(toInbound);
    },

    async parseWebhook(rawBody, headers) {
      if (!config.webhookSecret) {
        throw new AppError("not_configured", "AGENTMAIL_WEBHOOK_SECRET is not set");
      }
      try {
        // Throws on a bad signature or a timestamp outside the tolerance window.
        new Webhook(config.webhookSecret).verify(rawBody, {
          "svix-id": headers.get("svix-id") ?? "",
          "svix-timestamp": headers.get("svix-timestamp") ?? "",
          "svix-signature": headers.get("svix-signature") ?? "",
        });
      } catch {
        throw new AppError("unauthorized", "invalid webhook signature");
      }
      const payload = JSON.parse(rawBody) as { event_type?: string; message?: AgentMailMessage };
      if (payload.event_type !== "message.received" || !payload.message) return [];
      return [toInbound(payload.message)];
    },
  };
}
