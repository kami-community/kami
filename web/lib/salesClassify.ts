import type { ReplyClassificationLabel } from "./salesTypes";

export interface ClassifyResult {
  label: ReplyClassificationLabel;
  confidence: number;
  escalation_required: boolean;
  draft_response?: string;
}

const RULES: {
  label: ReplyClassificationLabel;
  patterns: RegExp[];
  confidence: number;
  escalate?: boolean;
}[] = [
  {
    label: "unsubscribe",
    patterns: [/unsubscribe/i, /remove me/i, /opt[\s-]?out/i, /stop (emailing|contacting)/i],
    confidence: 0.95,
    escalate: true,
  },
  {
    label: "negative",
    patterns: [/not interested/i, /no thanks/i, /don't contact/i, /leave me alone/i],
    confidence: 0.9,
    escalate: true,
  },
  {
    label: "positive",
    patterns: [/interested/i, /let'?s (talk|chat|connect)/i, /sounds good/i, /would love to/i],
    confidence: 0.85,
  },
  {
    label: "information_request",
    patterns: [/\?/, /more info/i, /tell me more/i, /learn more/i, /pricing/i],
    confidence: 0.75,
  },
  {
    label: "objection",
    patterns: [/budget/i, /already (have|using)/i, /too expensive/i, /not a fit/i, /wrong person/i],
    confidence: 0.8,
    escalate: true,
  },
  {
    label: "not_now",
    patterns: [/not now/i, /maybe later/i, /next quarter/i, /circle back/i, /check back/i],
    confidence: 0.7,
  },
  {
    label: "referral",
    patterns: [/talk to/i, /reach out to/i, /contact (my|our)/i, /forward(ed)? (this )?to/i],
    confidence: 0.75,
  },
];

export function classifyReplyContent(content: string): ClassifyResult {
  const text = content.trim();
  if (!text) {
    return { label: "spam_risk", confidence: 0.5, escalation_required: true };
  }

  if (/meet|call|calendar|schedule|zoom|teams/i.test(text)) {
    return {
      label: "positive",
      confidence: 0.8,
      escalation_required: false,
      draft_response: suggestDraft("positive"),
    };
  }

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return {
        label: rule.label,
        confidence: rule.confidence,
        escalation_required: rule.escalate ?? false,
        draft_response: suggestDraft(rule.label),
      };
    }
  }

  if (text.length < 8) {
    return { label: "spam_risk", confidence: 0.6, escalation_required: true };
  }

  return {
    label: "information_request",
    confidence: 0.5,
    escalation_required: false,
    draft_response: suggestDraft("information_request"),
  };
}

function suggestDraft(label: ReplyClassificationLabel): string | undefined {
  switch (label) {
    case "positive":
      return "Thanks for your interest — happy to share more. Would a 20-minute call this week work?";
    case "information_request":
      return "Great question. Here's a quick overview of how we help teams like yours…";
    case "objection":
      return "Appreciate the candor. Would it help if I sent a one-pager on ROI for similar teams?";
    case "not_now":
      return "Understood — I'll follow up in a few weeks unless you'd prefer I don't.";
    default:
      return undefined;
  }
}
