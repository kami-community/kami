"use client";

import type { ReactNode } from "react";
import { IconCheck } from "@/components/ui/icons";

/** A group of toggleable pill chips (multi-select), e.g. surfaces or goals. */
export default function ChipToggle<T extends string>({
  options,
  value,
  onChange,
  label,
  max,
  disabled = false,
}: {
  options: readonly { value: T; label: ReactNode; icon?: ReactNode }[];
  value: readonly T[];
  onChange: (next: T[]) => void;
  label: string;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <div className="chip-toggle-group" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.value);
        const full = max !== undefined && value.length >= max && !on;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={disabled || full}
            className="chip-toggle"
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
          >
            <span className="chip-toggle__mark" aria-hidden>
              {on ? <IconCheck size={10} strokeWidth={3} /> : o.icon}
            </span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
