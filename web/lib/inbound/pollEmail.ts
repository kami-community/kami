import type { Db } from "@/lib/db/client";
import type { EmailProvider } from "@/lib/ports/email";
import { ingestInboundEmail } from "./salesReplies";

/** Polling fallback for inbound replies when the AgentMail webhook is not configured. */
export async function pollEmailReplies(db: Db, email: EmailProvider) {
  const inbound = await email.listInbound({ limit: 100 });
  let matched = 0;
  let recorded = 0;
  for (const message of inbound) {
    const result = await ingestInboundEmail(db, message);
    if (result) matched++;
    if (result && !result.duplicate) recorded++;
  }
  return { checked: inbound.length, matched, recorded };
}
