"use client";

type ChipVariant = "positive" | "action" | "neutral" | "terminal";

interface StatusChipProps {
  label: string;
  variant?: ChipVariant;
}

const VARIANT_STYLES: Record<ChipVariant, { bg: string; color: string; border: string }> = {
  positive: { bg: "var(--moss)", color: "var(--paper)", border: "var(--moss)" },
  action: { bg: "var(--hanko)", color: "var(--paper)", border: "var(--hanko)" },
  neutral: { bg: "transparent", color: "var(--ink-soft)", border: "var(--outline)" },
  terminal: { bg: "var(--kraft-light)", color: "var(--ink-soft)", border: "var(--outline)" },
};

export function statusVariant(status: string): ChipVariant {
  const positives = [
    "connected",
    "approved",
    "agreed",
    "content_live",
    "completed",
    "converted",
    "concluded",
    "sent",
  ];
  const actions = [
    "identified",
    "negotiating",
    "in_conversation",
    "awaiting_reply",
    "escalated",
    "first_msg_drafted",
  ];
  const terminals = ["lost", "stalled", "paid"];
  if (positives.includes(status)) return "positive";
  if (actions.includes(status)) return "action";
  if (terminals.includes(status)) return "terminal";
  return "neutral";
}

export default function StatusChip({ label, variant }: StatusChipProps) {
  const v = variant ?? statusVariant(label);
  const s = VARIANT_STYLES[v];
  return (
    <span
      className="mono"
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        padding: "0.15rem 0.5rem",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        whiteSpace: "nowrap",
      }}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}
