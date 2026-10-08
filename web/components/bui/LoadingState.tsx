"use client";

import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * LOADING STATE — pixel-grid loader for long-running work
 *
 * Variants:
 *   Drive  — square cells, chevron wavefront driving right;
 *            the 650ms cycle is shorter than the sweep, so
 *            two fronts are always in flight
 *   Dots   — same wavefront, circular cells
 *   Orbit  — a comet lapping the grid perimeter
 *
 * Paired with a shimmering label and a live elapsed timer
 * in mono tabular figures. Reduced motion freezes the grid
 * to its dim state; the timer still ticks.
 * ───────────────────────────────────────────────────────── */

const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3),
    c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i);
  return k === -1 ? null : k * 110;
});

export type LoaderVariant = "Drive" | "Dots" | "Orbit";

const PATTERNS: Record<LoaderVariant, { delays: (number | null)[]; dur: number; round: boolean }> =
  {
    Drive: { delays: chevron, dur: 650, round: false },
    Dots: { delays: chevron, dur: 650, round: true },
    Orbit: { delays: orbit, dur: 950, round: false },
  };

/** The 3×3 pixel grid on its own (inline spinners, buttons). */
export function LoaderGrid({ variant = "Drive" }: { variant?: LoaderVariant }) {
  const { delays, dur, round } = PATTERNS[variant];
  return (
    <span aria-hidden className="loader-grid">
      {delays.map((delay, index) => (
        <span
          key={index}
          className={`loader-grid__cell${round ? " loader-grid__cell--round" : ""}`}
          style={{
            opacity: delay === null ? 0.07 : 0.15,
            animation:
              delay === null ? "none" : `pixel-on ${dur}ms ease-in-out ${delay}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

function formatElapsed(ds: number): string {
  const total = ds / 10;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

function useElapsed(startedAt?: number) {
  const [now, setNow] = useState(() => Date.now());
  const [mountedAt] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  return formatElapsed(Math.max(0, Math.floor((now - (startedAt ?? mountedAt)) / 100)));
}

export default function LoadingState({
  label = "Working",
  variant = "Drive",
  startedAt,
  detail,
  elapsed = true,
}: {
  label?: string;
  variant?: LoaderVariant;
  /** epoch ms the work began (defaults to mount) — keeps the timer honest across re-renders */
  startedAt?: number;
  /** a quieter second line under the label */
  detail?: string | null;
  elapsed?: boolean;
}) {
  const time = useElapsed(startedAt);
  return (
    <div role="status" className="loading-state">
      <div className="loading-state__row">
        <LoaderGrid variant={variant} />
        <span className="shimmer shimmer--fast loading-state__label">{label}</span>
        {elapsed && <span className="loading-state__elapsed">{time}</span>}
      </div>
      {detail && <p className="loading-state__detail">{detail}</p>}
    </div>
  );
}
