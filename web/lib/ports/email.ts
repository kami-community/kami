/**
 * Email provider port. Services depend on this interface; vendor details
 * (AgentMail today) live in `lib/adapters/*`.
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSendReceipt {
  provider: string;
  /** Provider-assigned id. Always present — a send without one is treated as failed. */
  messageId: string;
  threadId?: string;
  from: string;
}

export interface InboundEmail {
  provider: string;
  messageId: string;
  threadId?: string;
  /** Bare address, lower-cased. */
  from: string;
  subject: string;
  text: string;
  receivedAt: string;
}

export interface EmailProvider {
  readonly id: string;
  /** Sending address shown to recipients. */
  readonly from: string;
  /**
   * Send one message. `idempotencyKey` must be stable per logical send so a
   * retry never delivers twice.
   */
  send(email: OutboundEmail, opts: { idempotencyKey: string }): Promise<EmailSendReceipt>;
  /** Reply in an existing thread to the given provider message id. */
  reply(
    params: { inReplyToMessageId: string; text: string },
    opts: { idempotencyKey: string },
  ): Promise<EmailSendReceipt>;
  /** Recent inbound messages (polling fallback when webhooks are not configured). */
  listInbound(opts: { limit: number }): Promise<InboundEmail[]>;
  /** Verify and parse a webhook delivery. Returns [] for events that are not inbound mail. */
  parseWebhook(rawBody: string, headers: Headers): Promise<InboundEmail[]>;
}

/** "Jane Doe <jane@example.com>" → "jane@example.com" */
export function bareAddress(value: string): string {
  const m = value.match(/<([^>]+)>/);
  return (m ? m[1] : value).trim().toLowerCase();
}
