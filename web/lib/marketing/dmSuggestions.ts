import { z } from "zod";
import { buildCompanyContextPack } from "@/lib/campaigns/contextPack";
import { getCampaign } from "@/lib/campaigns/sessions";
import type { Db } from "@/lib/db/client";
import { runAgentJson } from "@/lib/hermes/client";
import { AppError, notFound } from "@/lib/http/errors";

const SuggestionSchema = z.object({
  draft: z.string().max(1000).default(""),
  escalate: z.boolean().default(false),
  reason: z.string().max(300).default(""),
});

export type DmSuggestion = z.infer<typeof SuggestionSchema>;

/** Ask the dm-assistant for the founder's next message. Never sends. */
export async function suggestDm(
  db: Db,
  params: { sessionId: string; conversationId: string },
): Promise<DmSuggestion> {
  const { data: conversation, error } = await db
    .from("marketing_conversations")
    .select("id, goal, budget_min, budget_max, marketing_crm!inner(session_id, handle, platform)")
    .eq("id", params.conversationId)
    .eq("marketing_crm.session_id", params.sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!conversation) throw notFound("conversation not found for this campaign");

  const { data: messages } = await db
    .from("marketing_conversation_messages")
    .select("sender, content")
    .eq("conversation_id", conversation.id)
    .order("sent_at", { ascending: true })
    .limit(20);

  const crm = conversation.marketing_crm as unknown as { handle: string; platform: string };
  const { session, dossier } = await getCampaign(db, params.sessionId);
  const pack = buildCompanyContextPack({
    dossier,
    domain: session.canonical_domain,
    goals: session.goals,
  });
  const thread = (messages ?? [])
    .map((m) => `${m.sender === "kami" ? "Founder" : `@${crm.handle}`}: ${m.content}`)
    .join("\n");
  const budget =
    conversation.budget_min != null || conversation.budget_max != null
      ? `Budget range: $${conversation.budget_min ?? "?"}–$${conversation.budget_max ?? "?"}`
      : "";

  const { data } = await runAgentJson({
    agent: "dm-assistant",
    kind: "dm_suggest",
    kamiSessionId: params.sessionId,
    timeoutMs: 60_000,
    schema: SuggestionSchema,
    input: [
      `=== COMPANY CONTEXT PACK ===\n${pack}\n=== END PACK ===`,
      `Platform: ${crm.platform}. Goal: ${conversation.goal}. ${budget}`.trim(),
      `Conversation so far:\n${thread || "(no messages yet)"}`,
    ].join("\n\n"),
  });
  return data;
}
