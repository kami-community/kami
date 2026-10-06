"use client";

interface KillSwitchProps {
  paused: boolean;
  onChange: (paused: boolean) => void;
  disabled?: boolean;
}

/** Pause or resume every send, post and DM for this campaign. */
export default function KillSwitch({ paused, onChange, disabled }: KillSwitchProps) {
  return (
    <button
      type="button"
      className="kill-switch mono"
      aria-pressed={paused}
      onClick={() => onChange(!paused)}
      disabled={disabled}
    >
      {paused ? "▶ Resume all" : "⏸ Pause all"}
    </button>
  );
}
