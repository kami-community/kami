import { storedVerification, type FinderVerificationStatus } from "@/lib/domain/contacts";
import type { LeadScoreFactors, PipelineStage, EmailDraft } from "@/lib/salesTypes";
import { PIPELINE_TRANSITIONS } from "@/lib/salesTypes";
import { SEQUENCE_STEPS } from "@/lib/salesSequences";
import type { Row } from "./rows";

/** Pure Sales rules used by the services. No I/O — unit-tested in rules.test.ts. */

// --- Pipeline ---------------------------------------------------------------

/** Null when the move is allowed, otherwise the reason it is not. */
export function stageTransitionError(from: PipelineStage, to: PipelineStage): string | null {
  if (from === to) return null;
  return (PIPELINE_TRANSITIONS[from] ?? []).includes(to)
    ? null
    : `invalid pipeline transition: ${from} → ${to}`;
}

export const INCLUDED_NOTE = "included_for_approval";
export const EXCLUDED_NOTE = "excluded_from_cohort";

/** Founder includes/excludes an account from the outreach cohort. */
export function inclusionUpdate(
  notes: string | null | undefined,
  included: boolean,
): { pipeline_stage: PipelineStage; notes: string } {
  const note = included ? INCLUDED_NOTE : EXCLUDED_NOTE;
  return {
    pipeline_stage: included ? "ready_for_approval" : "researching",
    notes: notes ? `${notes}; ${note}` : note,
  };
}

// --- Scores -------------------------------------------------------------------

/** Keep the newest score per account. Rows must be ordered newest first. */
export function latestByAccount<T extends { account_id?: unknown }>(rows: T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const id = typeof row.account_id === "string" ? row.account_id : null;
    if (id && !latest.has(id)) latest.set(id, row);
  }
  return latest;
}

export const DISCOVERY_SCORE_MODEL = "v3-fit-intent-signals";

/** Contactability once a real contact email has been found. */
export const FOUND_EMAIL_CONTACTABILITY = 0.85;

export function bumpContactability(
  score: { factors: unknown; explanation?: unknown },
  found: { email: string; method?: string },
): { factors: LeadScoreFactors; explanation: string } {
  const factors = (
    score.factors && typeof score.factors === "object" ? score.factors : {}
  ) as LeadScoreFactors;
  const previous = typeof score.explanation === "string" ? score.explanation : "";
  return {
    factors: { ...factors, contactability: FOUND_EMAIL_CONTACTABILITY },
    explanation: `${previous} · Found ${found.email} (${found.method ?? "lookup"})`.trim(),
  };
}

// --- Contacts -----------------------------------------------------------------

export interface AccountContactSummary {
  id: string;
  name?: string;
  email?: string;
  email_verification?: string;
}

/** The first contact with an email for each account (the one the UI shows). */
export function primaryContactByAccount(contacts: Row[]): Map<string, AccountContactSummary> {
  const byAccount = new Map<string, AccountContactSummary>();
  for (const c of contacts) {
    const accountId = c.account_id as string | null;
    if (!accountId || !c.email || byAccount.has(accountId)) continue;
    byAccount.set(accountId, {
      id: c.id as string,
      name: (c.name as string | null) ?? undefined,
      email: c.email as string,
      email_verification: (c.email_verification as string | null) ?? undefined,
    });
  }
  return byAccount;
}

/** The stored contact row for an email an agent found on the account's domain. */
export function foundContactRow(params: {
  sessionId: string;
  accountId: string;
  campaignId: string | null;
  accountName: string;
  contact: {
    email: string;
    name?: string;
    title?: string;
    verification_status: FinderVerificationStatus;
  };
  at: string;
}) {
  return {
    session_id: params.sessionId,
    account_id: params.accountId,
    sales_campaign_id: params.campaignId,
    name: params.contact.name ?? params.accountName,
    title: params.contact.title ?? null,
    email: params.contact.email,
    email_verification: storedVerification(params.contact.verification_status),
    do_not_contact: false,
    updated_at: params.at,
  };
}

// --- Discovery ----------------------------------------------------------------

/**
 * Split an account's researched signals into ones already stored (matched by
 * source URL) and new ones to insert. Duplicate URLs within the batch are
 * inserted once; signals without a URL are always new.
 */
export function partitionSignals<S extends { url?: string | null }>(
  signals: S[],
  existingIdByUrl: Map<string, string>,
): { existingIds: string[]; toInsert: S[] } {
  const existingIds: string[] = [];
  const toInsert: S[] = [];
  const seen = new Set<string>();
  for (const signal of signals) {
    const url = signal.url ?? null;
    if (url) {
      const existing = existingIdByUrl.get(url);
      if (existing) {
        if (!existingIds.includes(existing)) existingIds.push(existing);
        continue;
      }
      if (seen.has(url)) continue;
      seen.add(url);
    }
    toInsert.push(signal);
  }
  return { existingIds, toInsert };
}

/** First allowed channel, defaulting to email. */
export function primaryChannel(allowed: unknown): string {
  return Array.isArray(allowed) && typeof allowed[0] === "string" ? allowed[0] : "email";
}

// --- Sequences ----------------------------------------------------------------

export function sequenceSteps() {
  return SEQUENCE_STEPS.map((s) => ({ step: s.step, delay_days: s.delay_days }));
}

export function defaultSequenceName(date: Date): string {
  return `Email sequence — ${date.toISOString().slice(0, 10)}`;
}

export function touchpointRows(sessionId: string, enrollmentId: string, drafts: EmailDraft[]) {
  return drafts.map((draft) => ({
    session_id: sessionId,
    enrollment_id: enrollmentId,
    channel: "email",
    step: draft.sequence_step,
    status: "drafted",
    draft_subject: draft.subject,
    draft_body: draft.body,
    draft_cta: draft.cta,
    draft_metadata: {
      evidence_refs: draft.evidence_refs,
      signal_ref: draft.signal_ref ?? null,
    },
  }));
}
