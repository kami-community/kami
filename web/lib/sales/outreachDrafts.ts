import { z } from "zod";
import { hermesConfigured, runAgentJson } from "@/lib/hermes/client";
import { reviewEmailDraft } from "@/lib/salesReview";
import { buildEmailSequence, ctaFromGoal } from "@/lib/salesSequences";
import type { AccountSignal, EmailDraft } from "@/lib/salesTypes";

/**
 * Email sequence drafting. The outreach agent writes a 3-step sequence grounded
 * in the account's dated signals; the review rubric runs inside the schema so
 * the agent gets one chance to fix problems. Without Hermes, or if the agent
 * fails, a deterministic template is used and labelled as such.
 */

export interface SequenceDraftInput {
  sessionId: string;
  contextPack: string;
  offer: string;
  approvedClaims: string[];
  goal: string;
  account: { name: string; domain?: string | null; industry?: string | null };
  contact: { name?: string | null; title?: string | null };
  signals: AccountSignal[];
}

export interface SequenceDrafts {
  drafts: EmailDraft[];
  source: "agent" | "template";
  notes?: string;
}

/** Rubric problems the agent can fix itself (a missing signal is flagged at review instead). */
const AGENT_FIXABLE = new Set([
  "subject_missing",
  "subject_too_long",
  "length_exceeded",
  "cta_count",
  "opt_out_missing",
  "claims_safety",
]);

function draftSchema(approvedClaims: string[]) {
  const Draft = z.object({
    sequence_step: z.number().int().min(1).max(3),
    subject: z.string().trim().min(1).max(120),
    body: z.string().trim().min(20).max(2000),
    cta: z.string().trim().min(1).max(200),
    signal_ref: z.string().url().optional(),
    evidence_refs: z.array(z.string()).default([]),
  });
  return z
    .object({ drafts: z.array(Draft).length(3), notes: z.string().max(500).optional() })
    .superRefine((value, ctx) => {
      const steps = value.drafts.map((d) => d.sequence_step).sort();
      if (steps.join() !== "1,2,3")
        ctx.addIssue({ code: "custom", message: "return exactly steps 1, 2 and 3" });
      value.drafts.forEach((d, i) => {
        const verdict = reviewEmailDraft({ ...d, approved_claims: approvedClaims });
        verdict.failed_criteria.forEach((criterion, j) => {
          if (AGENT_FIXABLE.has(criterion)) {
            ctx.addIssue({
              code: "custom",
              path: ["drafts", i],
              message: verdict.required_fixes[j] ?? criterion,
            });
          }
        });
      });
    });
}

function signalBlock(signals: AccountSignal[]): string {
  if (!signals.length) return "No dated signals were found for this account.";
  return signals
    .slice(0, 5)
    .map(
      (s) =>
        `- ${s.signal_type.replace(/_/g, " ")}: ${s.detail}` +
        `${s.observed_at ? ` (observed ${s.observed_at.slice(0, 10)})` : ""}` +
        `${s.source_url ? ` — ${s.source_url}` : ""}`,
    )
    .join("\n");
}

function template(input: SequenceDraftInput, notes?: string): SequenceDrafts {
  return {
    source: "template",
    notes,
    drafts: buildEmailSequence({
      offer: input.offer,
      claims: input.approvedClaims,
      account: {
        name: input.account.name,
        industry: input.account.industry ?? undefined,
        domain: input.account.domain ?? undefined,
      },
      contactName: input.contact.name,
      signals: input.signals,
      goal: input.goal,
    }),
  };
}

export async function draftSequence(input: SequenceDraftInput): Promise<SequenceDrafts> {
  if (!hermesConfigured()) return template(input, "Template draft — Hermes is not configured.");

  try {
    const { data } = await runAgentJson({
      agent: "outreach",
      kind: "sales_drafts",
      kamiSessionId: input.sessionId,
      timeoutMs: 120_000,
      schema: draftSchema(input.approvedClaims),
      input: [
        `=== COMPANY CONTEXT PACK ===\n${input.contextPack}\n=== END PACK ===`,
        `Offer: ${input.offer}`,
        `Approved claims (use only these): ${input.approvedClaims.length ? input.approvedClaims.join(" | ") : "none"}`,
        `Campaign goal: ${input.goal || "a reply"} — suggested call to action: "${ctaFromGoal(input.goal)}"`,
        `Account: ${input.account.name}${input.account.domain ? ` (${input.account.domain})` : ""}${input.account.industry ? `, ${input.account.industry}` : ""}`,
        `Contact: ${input.contact.name ?? "name unknown"}${input.contact.title ? `, ${input.contact.title}` : ""}`,
        `Signals:\n${signalBlock(input.signals)}`,
        "Every email must end with an opt-out line such as: If this isn't relevant, reply \"unsubscribe\" and I won't follow up.",
      ].join("\n\n"),
    });
    const drafts = [...data.drafts].sort((a, b) => a.sequence_step - b.sequence_step);
    return { source: "agent", notes: data.notes, drafts };
  } catch (err) {
    return template(
      input,
      `Template draft — the outreach agent failed (${err instanceof Error ? err.message : "error"}).`,
    );
  }
}
