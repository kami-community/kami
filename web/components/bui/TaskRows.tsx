"use client";

import { useState, type ReactNode } from "react";
import { IconCheck, IconChevronDown, IconClose, IconRetry } from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * TASK ROWS — live agent task status: running, failed, done.
 * Capsules (floating pills that square off when opened) or a
 * List (one card, ruled rows). Each row expands to its detail
 * lines with the same grammar as the Thinking trace.
 * ───────────────────────────────────────────────────────── */

export type TaskDetail = { label: string; meta?: string };

export type TaskStatus = "done" | "running" | "pending" | "failed";

export type TaskRow = {
  key: string;
  label: ReactNode;
  amount?: ReactNode;
  status: TaskStatus;
  /** number shown inside the ring while running/pending */
  step?: number;
  details?: TaskDetail[];
  /** replaces the default status pill */
  pill?: ReactNode;
  onRetry?: () => void;
};

export type TaskRowsLabels = { completed: string; failed: string };

const DEFAULT_LABELS: TaskRowsLabels = { completed: "Completed", failed: "Failed" };

function SpinnerRing({ active, children }: { active?: boolean; children?: ReactNode }) {
  const size = 24,
    stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="task-ring" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="task-ring__svg"
        style={active ? { animation: "spin 1.1s linear infinite" } : undefined}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        {active && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * 0.28} ${c * 0.72}`}
          />
        )}
      </svg>
      <span className="task-ring__label">{children}</span>
    </span>
  );
}

function Badge({ tone, children }: { tone: "red" | "green"; children: ReactNode }) {
  return <span className={`task-badge task-badge--${tone}`}>{children}</span>;
}

export default function TaskRows({
  variant = "Capsules",
  rows,
  labels,
  className,
  defaultOpen,
  onToggleRow,
}: {
  variant?: "Capsules" | "List";
  rows: TaskRow[];
  labels?: Partial<TaskRowsLabels>;
  className?: string;
  /** key of a row to open initially */
  defaultOpen?: string;
  onToggleRow?: (key: string, open: boolean) => void;
}) {
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});
  const copy = { ...DEFAULT_LABELS, ...labels };

  const badgeFor = (row: TaskRow, i: number) => {
    if (row.status === "done")
      return (
        <Badge tone="green">
          <IconCheck size={13} strokeWidth={3.5} />
        </Badge>
      );
    if (row.status === "failed")
      return (
        <Badge tone="red">
          <IconClose size={12} strokeWidth={3.5} />
        </Badge>
      );
    return <SpinnerRing active={row.status === "running"}>{row.step ?? i + 1}</SpinnerRing>;
  };

  const pillFor = (row: TaskRow) => {
    if (row.pill !== undefined) return row.pill;
    if (row.status === "done")
      return <span className="task-pill task-pill--green">{copy.completed}</span>;
    if (row.status === "failed")
      return (
        <span className="task-pill task-pill--red">
          {copy.failed}
          {row.onRetry && <IconRetry size={12} strokeWidth={3} />}
        </span>
      );
    return null;
  };

  const list = variant === "List";
  return (
    <div
      className={`task-rows${list ? " task-rows--list" : ""}${className ? ` ${className}` : ""}`}
    >
      {rows.map((row, i) => {
        const details = row.details ?? [];
        const open = (manualOpen[row.key] ?? row.key === defaultOpen) && details.length > 0;
        return (
          <div
            key={row.key}
            className="task-row"
            data-open={open}
            style={{
              animation: `fade-up 450ms var(--ease-out-strong) ${Math.min(i, 8) * 80}ms both`,
            }}
          >
            <div className="task-row__head">
              <button
                type="button"
                aria-expanded={details.length ? open : undefined}
                disabled={!details.length}
                onClick={() => {
                  setManualOpen((current) => ({ ...current, [row.key]: !open }));
                  onToggleRow?.(row.key, !open);
                }}
                className="task-row__toggle"
              >
                <span className="task-row__badge">{badgeFor(row, i)}</span>
                <span className="task-row__label">{row.label}</span>
                {row.amount !== undefined && <span className="task-row__amount">{row.amount}</span>}
              </button>
              {row.status === "failed" && row.onRetry ? (
                <button type="button" className="task-row__retry" onClick={row.onRetry}>
                  {pillFor(row)}
                </button>
              ) : (
                pillFor(row)
              )}
              {details.length > 0 && (
                <span aria-hidden className="task-row__chevron">
                  <IconChevronDown
                    size={15}
                    strokeWidth={2.2}
                    style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
                  />
                </span>
              )}
            </div>

            <div className="collapse" data-open={open}>
              <div className="collapse__inner">
                <div className="task-row__details">
                  <span aria-hidden className="task-row__rule" />
                  <div className="task-row__detail-list">
                    {details.map((d, j) => (
                      <div
                        key={`${d.label}-${j}`}
                        className="task-row__detail"
                        style={
                          open
                            ? {
                                animation: `fade-up 300ms var(--ease-out-strong) ${120 + j * 100}ms both`,
                              }
                            : undefined
                        }
                      >
                        <span className="task-row__detail-label">{d.label}</span>
                        {d.meta && <span className="task-row__detail-meta">{d.meta}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
