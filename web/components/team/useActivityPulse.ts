"use client";

import { useEffect, useRef } from "react";
import { useAgentActivity } from "@/components/shell/AgentActivity";

/**
 * Call `onChange` whenever an agent run starts or finishes (as seen by the
 * workspace activity poller), so Team screens refresh without their own timer.
 */
export function useActivityPulse(onChange: () => void): void {
  const activity = useAgentActivity();
  const pulse = `${activity.runs.map((r) => `${r.id}`).join(",")}|${activity.recent[0]?.id ?? ""}`;
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!activity.loaded) return;
    if (last.current !== null && last.current !== pulse) onChange();
    last.current = pulse;
  }, [pulse, activity.loaded, onChange]);
}
