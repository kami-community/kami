"use client";

import { useEffect, useState } from "react";

const DEFAULT_STAGES = [
  "Verifying company domains…",
  "Searching live signals…",
  "Looking up public contact emails…",
  "Asking Hermes when the site has no mailto…",
  "Scoring Fit × Timing…",
];

interface SalesBusyOverlayProps {
  title?: string;
  stages?: string[];
  /** Optional live status line from the caller */
  detail?: string | null;
}

/** Full-panel busy state so Find never looks “stuck with just …”. */
export default function SalesBusyOverlay({
  title = "Working…",
  stages = DEFAULT_STAGES,
  detail,
}: SalesBusyOverlayProps) {
  const [index, setIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (stages.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % stages.length);
    }, 3500);
    return () => window.clearInterval(id);
  }, [stages]);

  // A new title is a new job: restart the clock (state adjusted during render, not in an effect).
  const [timedTitle, setTimedTitle] = useState(title);
  if (timedTitle !== title) {
    setTimedTitle(title);
    setElapsedSec(0);
  }

  useEffect(() => {
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const stage = stages[index] ?? stages[0];
  const timeHint =
    elapsedSec > 90
      ? `Still working (${elapsedSec}s) — live checks can take a few minutes.`
      : `This can take 30–90+ seconds — domains are checked live (${elapsedSec}s).`;

  return (
    <div className="sales-busy" role="status" aria-live="polite" aria-busy="true">
      <div className="sales-busy-bar" aria-hidden />
      <p className="label-caps sales-busy-title">{title}</p>
      <p className="sales-busy-stage">{detail?.trim() || stage}</p>
      <p className="mono sales-busy-hint">{timeHint}</p>
      <ul className="sales-busy-ticks mono">
        {stages.map((s, i) => (
          <li key={s} data-active={i === index}>
            {i < index ? "✓" : i === index ? "→" : "·"} {s.replace(/…$/, "")}
          </li>
        ))}
      </ul>
    </div>
  );
}
