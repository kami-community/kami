import { z } from "zod";
import { buildCompanyContextPack } from "@/lib/campaigns/contextPack";
import { getCampaign } from "@/lib/campaigns/sessions";
import type { Db } from "@/lib/db/client";
import { hermesConfigured, runAgentJson } from "@/lib/hermes/client";
import { classifyReplyContent, type ClassifyResult } from "@/lib/salesClassify";
import { REPLY_CLASSIFICATION_LABELS } from "@/lib/salesTypes";

/**
 * Reply triage: the sales-conversation-manager agent classifies an inbound
 * reply and suggests a response for the founder. The keyword classifier is the
 * fallback and a safety floor — an explicit unsubscribe is always honoured.
 */

const TriageSchema = z.object({
  label: z.enum(REPLY_CLASSIFICATION_LABELS),
  confidence: z.number().min(0).max(1),
  escalation_required: z.boolean(),
  reason: z.string().max(300).optional(),
  draft_response: z.string().max(1200).optional(),
});

export interface TriageResult extends ClassifyResult {
  source: "agent" | "rules";
  reason?: string;
}

export async function triageReply(
  db: Db,
  params: { sessionId: string; content: string; previousMessages?: string[] },
): Promise<TriageResult> {
  const rules = classifyReplyContent(params.content);
  if (rules.label === "unsubscribe" || !hermesConfigured()) {
    return { ...rules, source: "rules" };
  }

  try {
    const { session, dossier } = await getCampaign(db, params.sessionId);
    const pack = buildCompanyContextPack({
      dossier,
      domain: session.canonical_domain,
      goals: session.goals,
    });
    const thread = (params.previousMessages ?? []).slice(-4).join("\n---\n");
    const { data } = await runAgentJson({
      agent: "sales-conversation-manager",
      kind: "reply_triage",
      kamiSessionId: params.sessionId,
      timeoutMs: 60_000,
      schema: TriageSchema,
      input: [
        `=== COMPANY CONTEXT PACK ===\n${pack}\n=== END PACK ===`,
        thread ? `Earlier messages in this thread:\n${thread}` : "",
        `New reply from the prospect:\n"""\n${params.content}\n"""`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    const suppressing = data.label === "unsubscribe" || data.label === "negative";
    return {
      label: data.label,
      confidence: data.confidence,
      escalation_required: data.escalation_required,
      draft_response: suppressing ? undefined : data.draft_response,
      reason: data.reason,
      source: "agent",
    };
  } catch {
    return { ...rules, source: "rules" };
  }
}
