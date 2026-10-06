"use client";

type ChipVariant = "positive" | "action" | "neutral" | "terminal";

interface StatusChipProps {
  label: string;
  variant?: ChipVariant;
}

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
  return <span className={`status-chip status-chip--${v}`}>{label.replace(/_/g, " ")}</span>;
}
