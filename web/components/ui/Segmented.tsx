"use client";

import { useRef, type ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  /** Accessible name when `label` is an icon. */
  ariaLabel?: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  shape?: "pill" | "rounded";
  block?: boolean;
  className?: string;
}

/**
 * Segmented control: a gray track with a raised thumb that glides to the
 * chosen option. Arrow keys move the choice (radio-group semantics).
 */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  shape = "pill",
  block = false,
  className,
}: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const last = options.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? i === last
          ? 0
          : i + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? i === 0
            ? last
            : i - 1
          : null;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`segmented${shape === "pill" ? " segmented--pill" : ""}${block ? " segmented--block" : ""}${className ? ` ${className}` : ""}`}
    >
      <span
        aria-hidden
        className="segmented__thumb"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.ariaLabel}
            tabIndex={on ? 0 : -1}
            className="segmented__option"
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.label}
            {o.count !== undefined && <span className="segmented__count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
