import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { runAgentJson } from "@/lib/hermes/client";
import type { AgentName } from "@/lib/hermes/agents";
import { AppError, badRequest, forbidden, notFound } from "@/lib/http/errors";

/**
 * Rewrite one passage of a stored draft (a Sales email or a distribution
 * post) with the agent that wrote it. Nothing is saved here: the founder
 * keeps or discards the replacement, and keeping it goes through the normal
 * edit path (which clears review and approval).
 */

export type DraftSubject = { type: "sales_touchpoint" | "distribution_opportunity"; id: string };

export interface RewriteInput {
  sessionId: string;
  subject: DraftSubject;
  selection: string;
  instruction: string;
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const URL_RE = /https?:\/\/[^\s)>\]]+/g;

/** Contact details and links the replacement adds that the draft didn't contain. */
export function inventedDetails(original: string, replacement: string): string[] {
  const known = new Set(
    [...(original.match(EMAIL) ?? []), ...(original.match(URL_RE) ?? [])].map((s) =>
      s.toLowerCase(),
    ),
  );
  return [...(replacement.match(EMAIL) ?? []), ...(replacement.match(URL_RE) ?? [])].filter(
    (s) => !known.has(s.toLowerCase()),
  );
}

function schema(original: string) {
  return z.object({ replacement: z.string().trim().min(1).max(2000) }).superRefine((value, ctx) => {
    const added = inventedDetails(original, value.replacement);
    if (added.length)
      ctx.addIssue({
        code: "custom",
        message: `do not add contact details or links that are not in the draft (${added.join(", ")})`,
      });
  });
}

async function loadDraft(
  db: Db,
  sessionId: string,
  subject: DraftSubject,
): Promise<{ text: string; agent: AgentName; locked: boolean }> {
  if (subject.type === "sales_touchpoint") {
    const { data, error } = await db
      .from("sales_touchpoints")
      .select("draft_body, status, sent_at")
      .eq("id", subject.id)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw new AppError("internal", error.message);
    if (!data) throw notFound("draft not found for this campaign");
    return {
      text: String(data.draft_body ?? ""),
      agent: "outreach",
      locked: data.status === "sent" || Boolean(data.sent_at),
    };
  }
  const { data, error } = await db
    .from("distribution_opportunities")
    .select("draft, action_status")
    .eq("id", subject.id)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("opportunity not found for this campaign");
  return {
    text: String(data.draft ?? ""),
    agent: "distribution-manager",
    locked: data.action_status === "published" || data.action_status === "posted_manual",
  };
}

export async function rewritePassage(
  db: Db,
  input: RewriteInput,
): Promise<{ replacement: string }> {
  const draft = await loadDraft(db, input.sessionId, input.subject);
  if (draft.locked) throw forbidden("this draft already went out and can't be rewritten");
  if (!draft.text.includes(input.selection))
    throw badRequest("the selected passage is no longer in the draft — reload and try again");

  const { data } = await runAgentJson({
    agent: draft.agent,
    kind: "draft_rewrite",
    kamiSessionId: input.sessionId,
    schema: schema(draft.text),
    input: [
      "Rewrite ONE passage of the founder's draft. Return only the replacement for the selected passage, so it drops back into the same spot.",
      "Keep the founder's voice and every fact. Never add contact details, links, numbers or claims that are not already in the draft.",
      `Instruction: ${input.instruction}`,
      "",
      "=== FULL DRAFT (context) ===",
      draft.text,
      "=== SELECTED PASSAGE ===",
      input.selection,
      "",
      'Reply with a fenced ```json block: {"replacement": "..."}',
    ].join("\n"),
  });
  return { replacement: data.replacement };
}
