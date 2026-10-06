"use client";

interface EscalationBannerProps {
  reason: string;
  onApprove: () => void;
  onCounter: () => void;
  onDecline: () => void;
}

/** A conversation the agent will not handle alone: the founder decides. */
export default function EscalationBanner({
  reason,
  onApprove,
  onCounter,
  onDecline,
}: EscalationBannerProps) {
  return (
    <div className="escalation unfold" role="alert">
      <p className="escalation__reason">
        <span className="label-caps">Needs your decision</span>
        {reason}
      </p>
      <div className="actions">
        <button type="button" className="btn-secondary" onClick={onApprove}>
          Approve
        </button>
        <button type="button" className="btn-outline mono" onClick={onCounter}>
          Counter
        </button>
        <button type="button" className="btn-outline mono" onClick={onDecline}>
          Decline
        </button>
      </div>
    </div>
  );
}
