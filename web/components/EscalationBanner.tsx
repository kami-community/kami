"use client";

interface EscalationBannerProps {
  reason: string;
  onApprove: () => void;
  onCounter: () => void;
  onDecline: () => void;
}

export default function EscalationBanner({
  reason,
  onApprove,
  onCounter,
  onDecline,
}: EscalationBannerProps) {
  return (
    <div
      style={{
        background: "var(--hanko)",
        color: "var(--paper)",
        padding: "0.75rem 1rem",
        marginBottom: "var(--stack-sm)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "1rem",
        flexWrap: "wrap",
      }}
    >
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700 }}>
        ⚠ ESCALATION — {reason}
      </p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="mono"
          onClick={onApprove}
          style={{
            background: "var(--paper)",
            color: "var(--ink)",
            border: "none",
            padding: "0.3rem 0.7rem",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Approve
        </button>
        <button
          type="button"
          className="mono"
          onClick={onCounter}
          style={{
            background: "transparent",
            color: "var(--paper)",
            border: "1px solid var(--paper)",
            padding: "0.3rem 0.7rem",
            cursor: "pointer",
          }}
        >
          Counter
        </button>
        <button
          type="button"
          className="mono"
          onClick={onDecline}
          style={{
            background: "transparent",
            color: "var(--paper)",
            border: "1px solid var(--paper)",
            padding: "0.3rem 0.7rem",
            cursor: "pointer",
          }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
