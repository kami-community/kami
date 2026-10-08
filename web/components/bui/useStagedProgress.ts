"use client";

import { useEffect, useState } from "react";
import type { ThinkingRow } from "@/components/bui/ThinkingState";

/**
 * Rows for a single long request whose server-side steps are known in
 * advance (read dossier → draft → validate). While `busy`, stages advance
 * on a gentle schedule but never complete the last one; when the request
 * settles every stage is done (or the active one failed).
 */
export function useStagedProgress(
  stages: readonly string[],
  busy: boolean,
  options: { stepMs?: number; failed?: boolean } = {},
): { rows: ThinkingRow[]; startedAt: number | null } {
  const { stepMs = 3200, failed = false } = options;
  const [stage, setStage] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [wasBusy, setWasBusy] = useState(busy);

  // a new run restarts the stages (adjusted during render, not in an effect)
  if (busy !== wasBusy) {
    setWasBusy(busy);
    if (busy) {
      setStage(0);
      setStartedAt(null);
    }
  }

  // the clock starts on the first frame of the run
  useEffect(() => {
    if (!busy) return;
    const id = requestAnimationFrame(() => setStartedAt((s) => s ?? Date.now()));
    return () => cancelAnimationFrame(id);
  }, [busy]);

  useEffect(() => {
    if (!busy || stage >= stages.length - 1) return;
    const t = setTimeout(() => setStage((s) => s + 1), stepMs * (1 + stage * 0.35));
    return () => clearTimeout(t);
  }, [busy, stage, stages.length, stepMs]);

  const rows: ThinkingRow[] = stages.map((primary, i) => ({
    primary,
    state: busy
      ? i < stage
        ? "done"
        : i === stage
          ? "active"
          : "todo"
      : failed
        ? i < stage
          ? "done"
          : i === stage
            ? "error"
            : "todo"
        : "done",
  }));
  return { rows, startedAt };
}
