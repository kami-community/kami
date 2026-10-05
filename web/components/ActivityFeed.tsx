"use client";

import { useEffect, useRef } from "react";

export interface ActivityEvent {
  phase: string;
  message: string;
  at: string; // HH:MM:SS
}

/** Parse »[phase] lines out of streamed text; anything else becomes phase "agent". */
export function parseActivity(text: string): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^»\s*\[(\w+)\]\s*(.+)$/) ?? line.match(/^»\s*(.+)$/);
    if (!m) continue;
    const phase = m.length === 3 ? m[1] : "agent";
    const message = m.length === 3 ? m[2] : m[1];
    events.push({ phase, message, at: "" });
  }
  return events;
}

const PHASE_COLOR: Record<string, string> = {
  research: "var(--moss)",
  brand: "var(--hanko)",
  competitors: "var(--ink)",
  buckets: "var(--hanko)",
  strategy: "var(--moss)",
  execute: "var(--hanko)",
  handoff: "var(--hanko)",
  result: "var(--moss)",
  agent: "var(--outline)",
};

interface ActivityFeedProps {
  events: ActivityEvent[];
  running: boolean;
}

export default function ActivityFeed({ events, running }: ActivityFeedProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  return (
    <div>
      <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
        Agency at work {running ? "· LIVE" : "· idle"}
      </p>
      <div
        ref={ref}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--stack-sm)",
          maxHeight: 380,
          overflowY: "auto",
        }}
      >
        {events.length === 0 && (
          <p className="mono" style={{ color: "var(--ink-soft)" }}>
            » waiting for the manager to pick up the brief…
          </p>
        )}
        {events.map((e, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "baseline",
              borderLeft: `3px solid ${PHASE_COLOR[e.phase] ?? "var(--outline)"}`,
              paddingLeft: "0.75rem",
              // handoffs are the org-structure evidence — make them pop
              ...(e.phase === "handoff" || e.phase === "result"
                ? {
                    background: "var(--kraft-light)",
                    padding: "0.4rem 0.75rem",
                    border: "1px solid var(--crease)",
                    borderLeft: `3px solid ${PHASE_COLOR[e.phase]}`,
                  }
                : {}),
            }}
          >
            <span
              className="mono"
              style={{ color: PHASE_COLOR[e.phase] ?? "var(--outline)", minWidth: 92 }}
            >
              [{e.phase}]
            </span>
            <span style={{ fontSize: 14 }}>{e.message}</span>
          </div>
        ))}
        {running && (
          <p className="mono" style={{ color: "var(--hanko)" }}>
            ▊ working…
          </p>
        )}
      </div>
    </div>
  );
}
