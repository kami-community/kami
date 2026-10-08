"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { IconChevronLeft, IconChevronRight } from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * INSIGHT CARDS
 * Embedded mini-visualizations in an "Insights N ‹ ›"
 * carousel: a sentence of prose, a card, and a follow-up pill.
 * The trend chart is a hand-drawn SVG (Catmull-Rom smoothed)
 * with a scrub cursor and tooltip — no chart dependency.
 * ───────────────────────────────────────────────────────── */

export type InsightPage = {
  key: string;
  prose: ReactNode;
  card: ReactNode;
  /** follow-up question; clicking it calls `onFollowUp` */
  pill?: string;
};

/* Catmull-Rom resample — a sparse series becomes a dense, smooth one. */
function smooth(values: number[], perSegment = 9): number[] {
  if (values.length < 3) return values.slice();
  const out: number[] = [];
  const n = values.length;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = values[Math.max(0, i - 1)];
    const p1 = values[i];
    const p2 = values[i + 1];
    const p3 = values[Math.min(n - 1, i + 2)];
    for (let s = 0; s < perSegment; s += 1) {
      const t = s / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        0.5 *
          (2 * p1 +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3),
      );
    }
  }
  out.push(values[n - 1]);
  return out;
}

export type TrendSeries = { name: string; values: number[]; color: string };

/** Smooth multi-series line chart with a scrub cursor and tooltip. */
export function TrendChart({
  series,
  labels,
  format = (v: number) => String(Math.round(v)),
  height = 166,
}: {
  series: TrendSeries[];
  /** x labels, one per raw point (shown in the tooltip) */
  labels: string[];
  format?: (v: number) => string;
  height?: number;
}) {
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = height;
  const pad = 14;
  const all = series.flatMap((s) => s.values);
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 1);
  const span = max - min || 1;
  const count = Math.max(1, ...series.map((s) => s.values.length));
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2);

  const paths = useMemo(
    () =>
      series.map((s) => {
        const dense = smooth(s.values);
        const step = (W - 8) / Math.max(1, dense.length - 1);
        return dense
          .map((v, i) => `${i === 0 ? "M" : "L"}${(4 + i * step).toFixed(1)},${y(v).toFixed(1)}`)
          .join(" ");
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, min, span, H],
  );

  const xAt = (i: number) => 4 + (i / Math.max(1, count - 1)) * (W - 8);

  return (
    <div
      className="insight-chart-stage"
      style={{ height }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        setHover(Math.round(progress * (count - 1)));
      }}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.name} id={`${gradId}-${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {series.map((s, i) => (
          <g key={s.name}>
            <line
              x1="0"
              x2={W}
              y1={y(s.values[s.values.length - 1] ?? 0)}
              y2={y(s.values[s.values.length - 1] ?? 0)}
              stroke={s.color}
              strokeOpacity="0.35"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={`${paths[i]} L${W - 4},${H} L4,${H} Z`}
              fill={`url(#${gradId}-${i})`}
              stroke="none"
            />
            <path
              d={paths[i]}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={W - 4}
              cy={y(s.values[s.values.length - 1] ?? 0)}
              r="3"
              fill={s.color}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </svg>
      {hover !== null && (
        <>
          <span className="insight-chart-cursor" style={{ left: `${(xAt(hover) / W) * 100}%` }} />
          <span
            className="insight-chart-tooltip-anchor"
            style={{ left: `${Math.min(Math.max((xAt(hover) / W) * 100, 24), 76)}%` }}
          >
            <span className="insight-chart-tooltip">
              <span
                className="insight-chart-tooltip-item"
                style={{ color: "var(--tooltip-muted)" }}
              >
                {labels[hover]}
              </span>
              {series.map((s) => (
                <span key={s.name} className="insight-chart-tooltip-item">
                  <span className="insight-chart-tooltip-dot" style={{ background: s.color }} />
                  {format(s.values[hover] ?? 0)}
                </span>
              ))}
            </span>
          </span>
        </>
      )}
    </div>
  );
}

/** Two-up stat header + trend snapshot (the "compare" card). */
export function TrendCard({
  stats,
  series,
  labels,
  caption,
  pill,
  format,
}: {
  stats: {
    name: string;
    value: string;
    sub?: string;
    color: string;
    tone?: "red" | "green" | "ink";
  }[];
  series: TrendSeries[];
  labels: string[];
  caption: string;
  pill?: string;
  format?: (v: number) => string;
}) {
  return (
    <div className="insight-card">
      <div className="insight-card__stats">
        {stats.map((s) => (
          <div key={s.name} className="insight-card__stat">
            <span className="insight-card__stat-name">
              <span className="insight-card__dot" style={{ background: s.color }} />
              {s.name}
            </span>
            <span
              className={`insight-card__stat-value insight-card__stat-value--${s.tone ?? "ink"}`}
            >
              {s.value}
            </span>
            {s.sub && <span className="insight-card__stat-sub mono">{s.sub}</span>}
          </div>
        ))}
      </div>
      <div className="insight-card__chart">
        <div className="insight-card__chart-bar">
          <span className="insight-card__caption">{caption}</span>
          {pill && <span className="insight-card__pill">{pill}</span>}
        </div>
        <TrendChart series={series} labels={labels} format={format} />
      </div>
    </div>
  );
}

export type AllocationSegment = {
  name: string;
  label: string;
  pct: number;
  value: string;
  color: string;
  note?: string;
};

/** Hero number + segmented bar + legend (the "allocation" card). */
export function AllocationCard({
  title,
  segments,
  emptyNote,
}: {
  title: ReactNode;
  segments: AllocationSegment[];
  emptyNote?: string;
}) {
  const [selected, setSelected] = useState(segments[0]?.name ?? "");
  const active = segments.find((segment) => segment.name === selected) ?? segments[0];
  if (!active)
    return <div className="insight-card text-3 text-sm">{emptyNote ?? "No data yet"}</div>;

  return (
    <div className="insight-card">
      <span className="insight-card__title">{title}</span>
      <span className="insight-card__hero">{active.value}</span>
      <div className="alloc-bar" role="group" aria-label="Segments">
        {segments.map((s) => (
          <button
            key={s.name}
            type="button"
            aria-pressed={selected === s.name}
            aria-label={`${s.label}: ${s.pct}%`}
            onClick={() => setSelected(s.name)}
            className="alloc-bar__seg"
            style={{
              width: `${Math.max(s.pct, 3)}%`,
              background: s.color,
              opacity: selected === s.name ? 1 : 0.58,
              boxShadow: selected === s.name ? "inset 0 0 0 1px rgba(255,255,255,0.22)" : undefined,
            }}
          >
            <span
              className="alloc-bar__sheen"
              style={{
                width: selected === s.name ? "calc(100% - 8px)" : "0%",
                opacity: selected === s.name ? 1 : 0,
              }}
            />
          </button>
        ))}
      </div>
      <div className="alloc-legend">
        {segments.map((s) => (
          <button
            key={s.name}
            type="button"
            aria-pressed={selected === s.name}
            onClick={() => setSelected(s.name)}
            className="alloc-legend__item"
          >
            <span
              className="insight-card__dot insight-card__dot--sm"
              style={{ background: s.color }}
            />
            {s.name} <span className="tabular">{s.pct}%</span>
          </button>
        ))}
      </div>
      <div className="insight-card__note">
        <span className="insight-card__note-title" style={{ color: active.color }}>
          {active.label}
        </span>
        <span className="insight-card__note-body">{active.note ?? ""}</span>
      </div>
    </div>
  );
}

export default function InsightCards({
  pages,
  title = "Insights",
  onFollowUp,
}: {
  pages: InsightPage[];
  title?: string;
  onFollowUp?: (text: string) => void;
}) {
  const [page, setPage] = useState(0);
  if (!pages.length) return null;
  const current = pages[Math.min(page, pages.length - 1)];
  const move = (direction: -1 | 1) => setPage((p) => (p + direction + pages.length) % pages.length);

  return (
    <div className="insights">
      <div className="insights__head">
        <span className="insights__title">
          <span>{title}</span>
          <span className="text-3 tabular">{pages.length}</span>
        </span>
        {pages.length > 1 && (
          <span className="row" style={{ gap: 2 }}>
            <button
              type="button"
              aria-label="Previous insight"
              onClick={() => move(-1)}
              className="icon-btn icon-btn--sm"
            >
              <IconChevronLeft size={13} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              aria-label="Next insight"
              onClick={() => move(1)}
              className="icon-btn icon-btn--sm"
            >
              <IconChevronRight size={13} strokeWidth={2.2} />
            </button>
          </span>
        )}
      </div>
      <div key={current.key} className="insights__page">
        <p className="insights__prose">{current.prose}</p>
        <div className="insights__card">{current.card}</div>
        {current.pill && (
          <button
            type="button"
            className="insights__pill"
            onClick={() => onFollowUp?.(current.pill!)}
          >
            {current.pill}
          </button>
        )}
      </div>
    </div>
  );
}
