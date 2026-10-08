"use client";

import { useEffect, useState } from "react";
import type { RunStatus } from "@/lib/activity/runs";

/** Shared time formatting and a ticking clock for live agent timers. */

/** 14_000 → "0:14", 3_723_000 → "1:02:03". */
export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** 1_240 → "1.2s", 64_000 → "1m 4s". */
export function duration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** "just now", "4m ago", "2h ago", "3d ago". */
export function timeAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "never";
  const diff = Math.max(0, now - Date.parse(iso));
  if (diff < 45_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

/** The current time, re-rendering every `everyMs` while `active`. */
export function useNow(active: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [active, everyMs]);
  return now;
}

/** Founder-facing words for a run status. */
export function runStatusLabel(status: RunStatus): string {
  switch (status) {
    case "ok":
      return "Done";
    case "error":
      return "Failed";
    case "timeout":
      return "Timed out";
    case "stale":
      return "Lost";
    case "running":
      return "Working";
    case "fallback":
      return "Fallback";
    case "skipped":
      return "Skipped";
  }
}
