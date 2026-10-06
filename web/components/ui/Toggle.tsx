"use client";

import type { ReactNode } from "react";

/** A switch row: label + hint, role="switch". */
export default function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="toggle"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__track" aria-hidden>
        <span className="toggle__thumb" />
      </span>
      <span className="toggle__copy">
        <span className="toggle__label">{label}</span>
        {hint && <span className="toggle__hint">{hint}</span>}
      </span>
    </button>
  );
}
