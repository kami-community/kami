import { isSequenceEligibleContact } from "@/lib/domain/contacts";
import type { SalesSegment } from "@/lib/domain/segments";
import type { AccountSignal, LeadScoreFactors, SalesAccount } from "@/lib/salesTypes";

/** Pure view rules for the Find step. Browser-safe; unit-tested in rules.test.ts. */

export interface AccountContact {
  id?: string;
  name?: string;
  email?: string;
  email_verification?: string;
}

export interface AccountWithMeta extends SalesAccount {
  signals?: AccountSignal[];
  contact?: AccountContact | null;
  score?: { factors: LeadScoreFactors; explanation: string };
}

export interface ScoreRow {
  account_id: string;
  factors?: LeadScoreFactors;
  explanation?: string;
}

/** Included = moved to the approval cohort and not later excluded. */
export function isIncluded(account: Pick<SalesAccount, "pipeline_stage" | "notes">): boolean {
  if (account.pipeline_stage !== "ready_for_approval" && account.pipeline_stage !== "sequencing") {
    return false;
  }
  return !account.notes?.includes("excluded_from_cohort");
}

/** Has an email that may enter a sequence (evidenced or founder-provided). */
export function hasEligibleEmail(account: AccountWithMeta): boolean {
  return Boolean(account.contact && isSequenceEligibleContact(account.contact));
}

/** Every segment is PLG with no seed companies — company Find does not apply. */
export function isPlgOnly(segments: SalesSegment[] | null | undefined): boolean {
  const segs = segments ?? [];
  return (
    segs.length > 0 &&
    segs.every((s) => s.motion === "plg_self_serve" && (s.candidate_companies?.length ?? 0) === 0)
  );
}

export function hasB2bSeeds(segments: SalesSegment[] | null | undefined): boolean {
  return (segments ?? []).some(
    (s) => s.motion !== "plg_self_serve" || (s.candidate_companies?.length ?? 0) > 0,
  );
}

/** Discovery returned nothing but PLG-shaped warnings: point at distribution instead. */
export function onlyPlgWarnings(accountCount: number, warnings: string[]): boolean {
  if (accountCount > 0 || !warnings.length) return false;
  return warnings.every((w) => /plg|individual|self[- ]?serve|not a company|consumer/i.test(w));
}

export function mergeScores(accounts: AccountWithMeta[], scores: ScoreRow[]): AccountWithMeta[] {
  const byAccount = new Map<string, { factors: LeadScoreFactors; explanation: string }>();
  for (const s of scores) {
    if (s.account_id && s.factors) {
      byAccount.set(s.account_id, { factors: s.factors, explanation: s.explanation ?? "" });
    }
  }
  return accounts.map((a) => ({ ...a, score: a.id ? byAccount.get(a.id) : undefined }));
}

/** Accounts grouped by segment (falling back to industry), in first-seen order. */
export function groupAccounts(accounts: AccountWithMeta[]): [string, AccountWithMeta[]][] {
  const groups = new Map<string, AccountWithMeta[]>();
  for (const acc of accounts) {
    const key = acc.segment_key || acc.industry || "Other";
    groups.set(key, [...(groups.get(key) ?? []), acc]);
  }
  return [...groups.entries()];
}

export type PrimaryAction = "distribution" | "discover" | "find_emails" | "draft" | null;

/** The one primary (hanko) action for the current state of the Find step. */
export function primaryAction(state: {
  distributionPath: boolean;
  canCreateDistribution: boolean;
  hasB2bSeeds: boolean;
  accountCount: number;
  includedCount: number;
  missingEmailSelected: number;
  missingEmailAny: number;
}): PrimaryAction {
  if (state.distributionPath) return state.canCreateDistribution ? "distribution" : null;
  if (state.includedCount > 0) return state.missingEmailSelected > 0 ? "find_emails" : "draft";
  if (state.accountCount === 0) return state.hasB2bSeeds ? "discover" : null;
  return state.missingEmailAny > 0 ? "find_emails" : null;
}

export function companies(n: number): string {
  return `${n} compan${n === 1 ? "y" : "ies"}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function looksLikeEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Fit × Timing quadrant for the funnel summary. */
export function quadrant(fit: number, intent: number): "Act now" | "Nurture" | "Qualify" | "Park" {
  const hiFit = fit >= 0.55;
  const hiIntent = intent >= 0.45;
  if (hiFit && hiIntent) return "Act now";
  if (hiFit) return "Nurture";
  if (hiIntent) return "Qualify";
  return "Park";
}
