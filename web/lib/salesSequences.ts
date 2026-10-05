import type { AccountSignal, EmailDraft } from "./salesTypes";

export interface BuildEmailSequenceParams {
  offer: string;
  claims: string[];
  account: { name: string; industry?: string; domain?: string };
  signals: AccountSignal[];
  tone?: string;
  /** Campaign / session goals — drives CTA wording (never defaults to meetings-only). */
  goal?: string;
}

/** Pick a CTA from goal + motion; product-neutral (no hardcoded "book a call"). */
export function ctaFromGoal(goal?: string): string {
  const g = (goal ?? "").toLowerCase();
  if (/\binvestor|vc|fundrais/.test(g)) return "Would a short intro call this week be useful?";
  if (/\btrial|signup|sign.?up|plg|product.?led|activation/.test(g)) {
    return "Open to trying a short trial / product walkthrough?";
  }
  if (/\bawareness|content|launch|pr\b/.test(g)) {
    return "Open to a quick collab or quote for a launch note?";
  }
  if (/\bdemo|meeting|call|pipeline|outbound|sdr|book/.test(g)) {
    return "Worth a 15-minute call this week?";
  }
  return "Open to a short reply if this is relevant?";
}

const OPT_OUT_FOOTER =
  "\n\n—\nIf this isn't relevant, reply \"unsubscribe\" and I won't follow up.";

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function trimToWordLimit(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function pickSignal(signals: AccountSignal[]): AccountSignal | null {
  if (!signals.length) return null;
  return (
    signals.find((s) => s.source_url && s.detail) ?? signals.find((s) => s.detail) ?? signals[0]
  );
}

function formatSignalHook(signal: AccountSignal, accountName: string): string {
  const detail = signal.detail.trim();
  const when = signal.observed_at
    ? ` (${new Date(signal.observed_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })})`
    : "";
  return `Saw ${accountName}'s ${signal.signal_type.replace(/_/g, " ")} — ${detail}${when}.`;
}

function pickClaim(claims: string[]): string | null {
  const safe = claims.filter((c) => c.trim().length > 0);
  return safe[0] ?? null;
}

function buildOpener(
  params: BuildEmailSequenceParams,
  signal: AccountSignal | null,
  claim: string | null,
): EmailDraft {
  const { offer, account, goal } = params;
  const firstName = account.name.split(/\s+/)[0] || "there";
  const cta = ctaFromGoal(goal);
  const hook = signal
    ? formatSignalHook(signal, account.name)
    : `Noticed ${account.name}${account.industry ? ` in ${account.industry}` : ""} and thought this might be timely.`;

  const proof = claim ? ` ${claim}` : "";
  const bodyCore = trimToWordLimit(
    `Hi ${firstName},\n\n${hook}\n\nWe help teams with ${offer}.${proof}\n\n${cta}`,
    130,
  );
  const body = `${bodyCore}${OPT_OUT_FOOTER}`;

  const subjectBase = signal
    ? `${account.name} + ${signal.signal_type.replace(/_/g, " ")}`
    : `${offer} for ${account.name}`;
  const subject = subjectBase.slice(0, 58);

  return {
    subject,
    body,
    cta,
    evidence_refs: signal ? ([signal.id, signal.source_url].filter(Boolean) as string[]) : [],
    sequence_step: 1,
    signal_ref: signal?.source_url ?? signal?.id,
  };
}

function buildValueFollowUp(
  params: BuildEmailSequenceParams,
  signal: AccountSignal | null,
  claim: string | null,
): EmailDraft {
  const { offer, account, claims } = params;
  const firstName = account.name.split(/\s+/)[0] || "there";
  const angle =
    claims[1]?.trim() ||
    claim ||
    `Teams like yours use us to move faster on ${offer.toLowerCase()}.`;
  const signalNote = signal ? `Given your recent ${signal.signal_type.replace(/_/g, " ")}, ` : "";

  const bodyCore = trimToWordLimit(
    `Hi ${firstName},\n\n${signalNote}I wanted to share one angle we haven't covered: ${angle}\n\nHappy to send a one-pager if useful — should I?`,
    130,
  );
  const body = `${bodyCore}${OPT_OUT_FOOTER}`;

  return {
    subject: `Re: ${offer} — one angle for ${account.name}`.slice(0, 58),
    body,
    cta: "Happy to send a one-pager if useful — should I?",
    evidence_refs: signal
      ? ([signal.id, signal.source_url].filter(Boolean) as string[])
      : claim
        ? ["approved_claim"]
        : [],
    sequence_step: 2,
    signal_ref: signal?.source_url ?? signal?.id,
  };
}

function buildCloseLoop(params: BuildEmailSequenceParams): EmailDraft {
  const { offer, account } = params;
  const firstName = account.name.split(/\s+/)[0] || "there";

  const bodyCore = trimToWordLimit(
    `Hi ${firstName},\n\nI'll close the loop here — if ${offer.toLowerCase()} isn't a priority right now, no worries.\n\nIf timing opens up later, reply anytime and we can pick this back up.`,
    120,
  );
  const body = `${bodyCore}${OPT_OUT_FOOTER}`;

  return {
    subject: `Closing the loop — ${account.name}`.slice(0, 58),
    body,
    cta: "Reply anytime and we can pick this back up.",
    evidence_refs: [],
    sequence_step: 3,
  };
}

/** Build a 3-step email sequence: opener, value-add follow-up, close-the-loop. */
export function buildEmailSequence(params: BuildEmailSequenceParams): EmailDraft[] {
  const signal = pickSignal(params.signals);
  const claim = pickClaim(params.claims);

  const drafts = [
    buildOpener(params, signal, claim),
    buildValueFollowUp(params, signal, claim),
    buildCloseLoop(params),
  ];

  return drafts.map((d) => ({
    ...d,
    body: wordCount(d.body) > 150 ? trimToWordLimit(d.body, 150) : d.body,
  }));
}

export const SEQUENCE_STEPS = [
  { step: 1, delay_days: 0, label: "opener" },
  { step: 2, delay_days: 3, label: "value_add" },
  { step: 3, delay_days: 7, label: "close_loop" },
] as const;
