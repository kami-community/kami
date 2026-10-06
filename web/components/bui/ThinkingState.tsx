"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  IconCheck,
  IconChevronDown,
  IconClose,
  IconGlobe,
  IconSearch,
  IconSparkle,
} from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * THINKING — expandable agent trace, four variants
 *
 *   Steps      step list with spinner → muted checks
 *   Reasoning  prose reasoning that expands, then settles
 *   Search     web-search trace: query + sources read
 *   Coding     tool trace: files read, edits, commands
 *
 * Kami drives it with real state: `working` while the agent
 * runs, and each row carries its own state. The trace is
 * open while working, settles closed, and stays expandable.
 * ───────────────────────────────────────────────────────── */

export type ThinkingRow = {
  primary: string;
  secondary?: string;
  mono?: boolean;
  add?: number;
  del?: number;
  href?: string;
  /** Steps only: todo rows are hidden until they start. */
  state?: "done" | "active" | "todo" | "error";
};

export type ThinkingVariant = "Steps" | "Reasoning" | "Search" | "Coding";

const DOT_TONES = ["var(--accent)", "var(--orange)", "var(--green)"];

export default function ThinkingState({
  variant = "Steps",
  working,
  rows,
  active = "Thinking",
  done = "Done",
  query,
  more,
  icon,
  defaultExpanded,
  failed = false,
}: {
  variant?: ThinkingVariant;
  working: boolean;
  rows: ThinkingRow[];
  /** header label while working */
  active?: string;
  /** header label once settled */
  done?: string;
  /** Search: the query line */
  query?: string;
  /** Search: "+7 more" */
  more?: number;
  /** override the header glyph (defaults to the sparkle) */
  icon?: ReactNode;
  /** start expanded after settling (defaults to collapsing) */
  defaultExpanded?: boolean;
  failed?: boolean;
}) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const autoExpanded = working || Boolean(defaultExpanded);
  const expanded = manualExpanded ?? autoExpanded;
  const visibleRows = rows.filter((r) => r.state !== "todo");
  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);
  useLayoutEffect(() => {
    if (traceRef.current) setLineHeight(traceRef.current.offsetHeight);
  }, [visibleRows.length, expanded, variant, working]);

  const headColor = working ? "var(--ink-2)" : failed ? "var(--red)" : "var(--ink-3)";

  return (
    <div className="thinking">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManualExpanded((current) => !(current ?? autoExpanded))}
        className="thinking__head"
      >
        <span className="thinking__glyph" style={{ color: headColor }}>
          {icon ?? <IconSparkle size={16} />}
        </span>
        <span role="status" className="thinking__status">
          {working ? (
            <span className="shimmer shimmer--fast thinking__label">{active}</span>
          ) : (
            <span
              className="thinking__label thinking__label--done"
              style={failed ? { color: "var(--red)" } : undefined}
            >
              {done}
            </span>
          )}
        </span>
        <IconChevronDown
          size={14}
          strokeWidth={2.2}
          className="thinking__chevron"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
        />
      </button>

      <div className="collapse" data-open={expanded}>
        <div className="collapse__inner">
          <div className="thinking__trace">
            <span
              aria-hidden
              className="thinking__line"
              style={{ height: lineHeight ? lineHeight - 2 : 0 }}
            />
            <div ref={traceRef} className="thinking__rows">
              {query && (
                <div
                  className="thinking__query"
                  style={{
                    animation: expanded ? "fade-up 300ms var(--ease-out-strong) both" : undefined,
                  }}
                >
                  <IconSearch size={14} style={{ color: "var(--ink-3)" }} />
                  <span>{query}</span>
                </div>
              )}
              {visibleRows.map((row, i) => {
                const content = (
                  <>
                    {variant === "Search" && (
                      <span className="thinking__dot" style={{ background: DOT_TONES[i % 3] }}>
                        <IconGlobe size={9} strokeWidth={2.5} />
                      </span>
                    )}
                    {variant === "Steps" &&
                      (row.state === "error" ? (
                        <IconClose size={14} strokeWidth={2.5} style={{ color: "var(--red)" }} />
                      ) : row.state === "active" && working ? (
                        <span className="thinking__spinner" />
                      ) : (
                        <IconCheck size={14} strokeWidth={2.5} style={{ color: "var(--ink-3)" }} />
                      ))}
                    <span
                      className={`thinking__primary${variant === "Reasoning" ? " thinking__primary--prose" : ""}${variant === "Search" ? " animated-underline" : ""}`}
                    >
                      {row.primary}
                    </span>
                    {row.secondary && (
                      <span className={`thinking__secondary${row.mono ? " mono" : ""}`}>
                        {row.secondary}
                      </span>
                    )}
                    {row.add !== undefined && (
                      <span className="thinking__diff mono">
                        <span style={{ color: "var(--green)" }}>+{row.add}</span>{" "}
                        <span style={{ color: "var(--red)" }}>−{row.del ?? 0}</span>
                      </span>
                    )}
                  </>
                );
                const style = {
                  animation: `fade-up 320ms var(--ease-out-strong) ${Math.min(i, 6) * 60}ms both`,
                };
                if (row.href) {
                  return (
                    <a
                      key={`${row.primary}-${i}`}
                      href={row.href}
                      target="_blank"
                      rel="noreferrer"
                      className="thinking__row thinking__row--link"
                      style={style}
                    >
                      {content}
                    </a>
                  );
                }
                return (
                  <div key={`${row.primary}-${i}`} className="thinking__row" style={style}>
                    {content}
                  </div>
                );
              })}
              {more !== undefined && more > 0 && !working && (
                <span className="thinking__more">+{more} more</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
