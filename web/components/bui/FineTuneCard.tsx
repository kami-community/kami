"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import GlideMenu from "@/components/bui/GlideMenu";
import { IconCheck, IconChevronDown, IconSparkle } from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * FINE-TUNE CARD — compact interactive inspector.
 * Number fields scrub: hover the label for an ↔ cursor and
 * drag to adjust, use ↑/↓ (⇧ for ×10), or type directly.
 * A segmented control picks a preset; a menu picks a type.
 * ───────────────────────────────────────────────────────── */

export function ScrubField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
  active,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  active?: boolean;
}) {
  const drag = useRef<{ x: number; v: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));

  return (
    <label className={`scrub${active ? " is-active" : ""}`}>
      <span
        role="slider"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, v: value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          onChange(clamp(drag.current.v + ((e.clientX - drag.current.x) / 2) * step));
        }}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={(e) => {
          const mult = e.shiftKey ? 10 : 1;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            e.preventDefault();
            onChange(clamp(value + step * mult));
          } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            e.preventDefault();
            onChange(clamp(value - step * mult));
          }
        }}
        className="scrub__handle"
      >
        {label}
      </span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^\d-]/g, ""));
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        aria-label={`${label} value`}
        className="scrub__input"
      />
      {suffix && <span className="scrub__suffix">{suffix}</span>}
    </label>
  );
}

export type FineTuneField = {
  key: string;
  label: string;
  /** the default — fields that differ from it read as edited */
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
};

export type FineTuneSegment = { key: string; label: ReactNode; ariaLabel: string };

export type FineTuneState = {
  segment: string;
  values: Record<string, number>;
  type: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

export default function FineTuneCard({
  title,
  sectionLabel,
  segments,
  fields,
  options,
  typeLabel = "Type",
  placeholder = "Select",
  adjustLabel = "Adjust",
  editedLabel = "Edited",
  value,
  onChange,
}: {
  title: string;
  sectionLabel: string;
  segments: FineTuneSegment[];
  fields: FineTuneField[];
  options?: string[];
  typeLabel?: string;
  placeholder?: string;
  adjustLabel?: string;
  editedLabel?: string;
  value: FineTuneState;
  onChange: (state: FineTuneState) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const segIndex = Math.max(
    0,
    segments.findIndex((s) => s.key === value.segment),
  );

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  const changed = fields.some((f) => value.values[f.key] !== f.value);
  const done = segIndex !== 0 || changed || value.type !== null;

  return (
    <div className="finetune">
      <div className="primitive-card-bar finetune__bar">
        <span className="finetune__title">{title}</span>
        {done ? (
          <span className="finetune__edited">
            <IconCheck size={10} strokeWidth={3} />
            {editedLabel}
          </span>
        ) : (
          <span className="row" style={{ gap: 6 }}>
            <span className="finetune__spark">
              <IconSparkle size={9} style={{ color: "var(--accent)" }} />
            </span>
            <span className="finetune__adjust">{adjustLabel}</span>
          </span>
        )}
      </div>

      <div className="primitive-card-pad finetune__section">
        <p className="finetune__label">{sectionLabel}</p>
        <div className="finetune__segmented" role="radiogroup" aria-label={sectionLabel}>
          <span
            aria-hidden
            className="finetune__thumb"
            style={{
              width: `calc((100% - 4px) / ${segments.length})`,
              transform: `translateX(${segIndex * 100}%)`,
            }}
          />
          {segments.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-label={s.ariaLabel}
              aria-checked={i === segIndex}
              onClick={() => onChange({ ...value, segment: s.key })}
              className="finetune__seg"
            >
              {s.label}
            </button>
          ))}
        </div>
        {chunk(fields, 2).map((pair, ri) => (
          <div key={ri} className="finetune__pair">
            {pair.map((f) => (
              <ScrubField
                key={f.key}
                label={f.label}
                value={value.values[f.key] ?? f.value}
                onChange={(v) => onChange({ ...value, values: { ...value.values, [f.key]: v } })}
                min={f.min}
                max={f.max}
                step={f.step}
                suffix={f.suffix}
                active={(value.values[f.key] ?? f.value) !== f.value}
              />
            ))}
          </div>
        ))}
      </div>

      {options && (
        <div className="primitive-card-footer finetune__footer">
          <span className="text-3 text-xs">{typeLabel}</span>
          <div className="finetune__menu-wrap" ref={menuRef}>
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              onClick={() => setMenuOpen((c) => !c)}
              className={`finetune__select${menuOpen ? " is-open" : ""}`}
            >
              <span className={value.type ? "" : "text-3"}>{value.type ?? placeholder}</span>
              <IconChevronDown
                size={11}
                strokeWidth={2.5}
                style={{
                  color: "var(--ink-3)",
                  transform: menuOpen ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform 200ms",
                }}
              />
            </button>
            {menuOpen && (
              <div className="finetune__menu" role="listbox">
                <GlideMenu highlightClassName="finetune__glide">
                  {options.map((item) => (
                    <button
                      key={item}
                      data-menu-row
                      type="button"
                      role="option"
                      aria-selected={item === value.type}
                      onClick={() => {
                        onChange({ ...value, type: item });
                        setMenuOpen(false);
                      }}
                      className={`finetune__option${item === value.type ? " is-selected" : ""}`}
                    >
                      {item}
                    </button>
                  ))}
                </GlideMenu>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
