import type { ReviewerVerdict } from "./salesTypes";

export interface ReviewDraftInput {
  subject: string;
  body: string;
  cta: string;
  sequence_step: number;
  approved_claims?: string[];
  signal_ref?: string;
}

const UNSAFE_CLAIM_PATTERNS = [
  /\b\d{2,}%+\s*(increase|growth|lift|roi)\b/i,
  /\b\d+x\b/i,
  /\b(fortune|forbes)\s+\d+/i,
  /\b(unverified|placeholder|\[claim\]|\[metric\])\b/i,
];

function countCtas(body: string, cta: string): number {
  const main = body.split("\n\n—")[0] ?? body;
  const normalizedCta = cta.trim().toLowerCase();
  if (normalizedCta && main.toLowerCase().includes(normalizedCta)) return 1;
  return (main.match(/\?/g) ?? []).length;
}

function hasClaimSafetyIssues(body: string, approvedClaims: string[]): string[] {
  const issues: string[] = [];
  for (const pattern of UNSAFE_CLAIM_PATTERNS) {
    if (pattern.test(body)) {
      issues.push("body contains unverified metric or placeholder claim");
      break;
    }
  }
  if (approvedClaims.length === 0 && /\b(we help|our customers|clients)\b/i.test(body)) {
    issues.push("no approved claims configured — generic proof may need human review");
  }
  return issues;
}

/** Local reviewer rubric — mirrors skills/sales_review_rubric checks for MVP. */
export function reviewEmailDraft(input: ReviewDraftInput): ReviewerVerdict {
  const failed: string[] = [];
  const fixes: string[] = [];

  if (!input.subject?.trim()) {
    failed.push("subject_missing");
    fixes.push("Add a subject line under 60 characters.");
  } else if (input.subject.length > 60) {
    failed.push("subject_too_long");
    fixes.push("Shorten subject to under 60 characters.");
  }

  const words = input.body.trim().split(/\s+/).filter(Boolean).length;
  if (words > 150) {
    failed.push("length_exceeded");
    fixes.push(`Trim body to under 150 words (currently ${words}).`);
  }

  const ctaCount = countCtas(input.body, input.cta);
  if (ctaCount !== 1) {
    failed.push("cta_count");
    fixes.push("Include exactly one clear CTA in the body.");
  }

  if (!input.body.includes("unsubscribe") && !input.body.includes("won't follow up")) {
    failed.push("opt_out_missing");
    fixes.push("Include opt-out language in the footer.");
  }

  if (input.sequence_step === 1 && !input.signal_ref) {
    failed.push("signal_ref_missing");
    fixes.push("Step 1 cold email requires a verifiable signal reference.");
  }

  const claimIssues = hasClaimSafetyIssues(input.body, input.approved_claims ?? []);
  for (const issue of claimIssues) {
    failed.push("claims_safety");
    fixes.push(issue);
  }

  const approved = failed.length === 0;
  const score = approved ? 100 : Math.max(0, 100 - failed.length * 20);

  return {
    approved,
    score,
    failed_criteria: failed,
    required_fixes: fixes,
    reviewed_at: new Date().toISOString(),
  };
}

export function draftFromTouchpoint(row: Record<string, unknown>): ReviewDraftInput {
  const metadata = (row.draft_metadata ?? {}) as Record<string, unknown>;
  return {
    subject: String(row.draft_subject ?? ""),
    body: String(row.draft_body ?? ""),
    cta: String(row.draft_cta ?? ""),
    sequence_step: Number(row.step ?? 1),
    signal_ref: metadata.signal_ref as string | undefined,
  };
}
