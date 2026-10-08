import type { ReactNode } from "react";

export type Tone = "neutral" | "green" | "orange" | "red" | "accent";

/** State badge with a dot: "Completed", "Needs review", "Failed". */
export function StatusPill({
  tone = "neutral",
  children,
  dot = true,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`status-pill status-pill--${tone}`}>
      {dot && <span className="status-pill__dot" aria-hidden />}
      {children}
    </span>
  );
}

/** Inline value badge — a plain value (a date, a count) set off in prose. */
export function ValuePill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`value-pill value-pill--${tone}`}>{children}</span>;
}

const MONOGRAM_COLORS = [
  "oklch(0.68 0.16 50)",
  "oklch(0.62 0.17 255)",
  "oklch(0.62 0.15 152)",
  "oklch(0.6 0.18 300)",
  "oklch(0.63 0.19 20)",
  "oklch(0.66 0.13 200)",
  "oklch(0.7 0.14 85)",
];

/** A stable color for a name, so the same company always gets the same disc. */
export function monogramColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return MONOGRAM_COLORS[Math.abs(h) % MONOGRAM_COLORS.length];
}

/** Monogram mark — a colored disc with an initial. */
export function Monogram({
  name,
  children,
  color,
  shape = "round",
  size = "sm",
}: {
  name: string;
  children?: ReactNode;
  color?: string;
  shape?: "round" | "square";
  size?: "sm" | "lg";
}) {
  return (
    <span
      aria-hidden
      className={`monogram${shape === "square" ? " monogram--square" : ""}${size === "lg" ? " monogram--lg" : ""}`}
      style={{ background: color ?? monogramColor(name) }}
    >
      {children ?? (name.trim().charAt(0).toUpperCase() || "?")}
    </span>
  );
}

/** Inline entity reference — a monogram + name in a soft field pill. */
export function EntityChip({ name, color }: { name: string; color?: string }) {
  return (
    <span className="entity-chip">
      <Monogram name={name} color={color} />
      <span className="entity-chip__name">{name}</span>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function CountBadge({ children }: { children: ReactNode }) {
  return <span className="count-badge">{children}</span>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

/** Map a pipeline / workflow status string to a pill tone. */
export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (
    [
      "connected",
      "approved",
      "agreed",
      "content_live",
      "completed",
      "converted",
      "concluded",
      "sent",
      "posted",
      "ok",
      "done",
      "booked",
      "won",
      "replied",
      "interested",
      "delivered",
    ].includes(s)
  )
    return "green";
  if (
    [
      "identified",
      "negotiating",
      "in_conversation",
      "awaiting_reply",
      "escalated",
      "first_msg_drafted",
      "draft",
      "pending",
      "pending_review",
      "needs_review",
      "queued",
      "proposed",
      "open",
    ].includes(s)
  )
    return "orange";
  if (
    [
      "lost",
      "stalled",
      "failed",
      "error",
      "timeout",
      "bounced",
      "rejected",
      "blocked",
      "not_interested",
      "unsubscribed",
    ].includes(s)
  )
    return "red";
  if (["running", "sending", "in_progress", "active"].includes(s)) return "accent";
  return "neutral";
}

/** "first_msg_drafted" → "First msg drafted". */
export function humanize(status: string): string {
  const t = status.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
