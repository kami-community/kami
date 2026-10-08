"use client";

import { useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import { IconCheck } from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * DIFF TABLE
 * AI-proposed edits sweeping through tabular data. Each changed
 * row is the control: click it to include or exclude that
 * specific change before applying.
 *
 * Kami: rows are "removed", "added", "changed" (before → after)
 * or "same"; `onApply` receives the included keys.
 * ───────────────────────────────────────────────────────── */

export type DiffKind = "removed" | "added" | "changed" | "same";

export type DiffTableRow = {
  key: string;
  kind: DiffKind;
  /** one cell per column; for "changed" rows the last column shows before → after */
  cells: ReactNode[];
  before?: ReactNode;
};

function IncludedMark({ included, tone }: { included: boolean; tone: "red" | "green" | "accent" }) {
  return (
    <span aria-hidden className={`diff-mark${included ? ` diff-mark--${tone}` : ""}`}>
      {included ? <IconCheck size={11} strokeWidth={3} /> : null}
    </span>
  );
}

const TONE: Record<DiffKind, "red" | "green" | "accent" | null> = {
  removed: "red",
  added: "green",
  changed: "accent",
  same: null,
};

export default function DiffTable({
  title,
  columns,
  widths,
  rows,
  onApply,
  applyLabel = (n: number) => `Apply ${n} ${n === 1 ? "change" : "changes"}`,
  onCancel,
  appliedLabel = (n: number) => `${n} ${n === 1 ? "edit" : "edits"} applied`,
}: {
  title: ReactNode;
  columns: string[];
  /** CSS widths per column, e.g. ["30%", "70%"] */
  widths?: string[];
  rows: DiffTableRow[];
  onApply: (includedKeys: string[]) => void | Promise<void>;
  applyLabel?: (n: number) => string;
  onCancel?: () => void;
  appliedLabel?: (n: number) => string;
}) {
  const changed = rows.filter((r) => r.kind !== "same");
  const [edits, setEdits] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(changed.map((r) => [r.key, true])),
  );
  const [state, setState] = useState<"idle" | "busy" | "applied">("idle");
  const [error, setError] = useState<string | null>(null);
  const accepted = state === "applied";

  const count = (kind: DiffKind) => changed.filter((r) => r.kind === kind && edits[r.key]).length;
  const removals = count("removed");
  const additions = count("added");
  const changes = count("changed");
  const total = removals + additions + changes;

  const toggleEdit = (key: string) => setEdits((current) => ({ ...current, [key]: !current[key] }));

  async function apply() {
    setState("busy");
    setError(null);
    try {
      await onApply(changed.filter((r) => edits[r.key]).map((r) => r.key));
      setState("applied");
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Could not apply the changes");
    }
  }

  const summary = [
    changes ? `${changes} ${changes === 1 ? "change" : "changes"}` : null,
    removals ? `${removals} ${removals === 1 ? "removal" : "removals"}` : null,
    additions ? `${additions} ${additions === 1 ? "addition" : "additions"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="diff-table card">
      <div className="primitive-card-bar diff-table__bar">
        <span className="diff-table__title">{title}</span>
        {!accepted && changed.length > 0 && (
          <span className="diff-table__hint">Click changed rows to toggle</span>
        )}
      </div>

      <div className="diff-table__scroll">
        <table className="diff-table__table">
          {widths && (
            <colgroup>
              {widths.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>
              {columns.map((h) => (
                <th key={h} className="primitive-table-cell diff-table__th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const tone = TONE[row.kind];
              const included = Boolean(edits[row.key]);
              const live = tone !== null && included;
              const interactive = tone !== null && !accepted;
              const last = row.cells.length - 1;
              return (
                <tr
                  key={row.key}
                  tabIndex={interactive ? 0 : undefined}
                  aria-selected={tone ? included : undefined}
                  onClick={interactive ? () => toggleEdit(row.key) : undefined}
                  onKeyDown={
                    interactive
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleEdit(row.key);
                          }
                        }
                      : undefined
                  }
                  className={`diff-row diff-row--${row.kind}${live ? " is-live" : ""}${interactive ? " is-interactive" : ""}`}
                >
                  {row.cells.map((cell, i) => (
                    <td
                      key={i}
                      className={`primitive-table-cell diff-cell${i === 0 ? " diff-cell--first" : ""}`}
                    >
                      {i === last && tone ? (
                        <span className="diff-cell__end">
                          <span className="diff-cell__value">
                            {row.kind === "changed" && row.before !== undefined && (
                              <span className="diff-cell__before">{row.before}</span>
                            )}
                            <span className="diff-cell__after">{cell}</span>
                          </span>
                          <IncludedMark included={included} tone={tone} />
                        </span>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="primitive-card-footer diff-table__footer">
        {accepted ? (
          <span className="applied-pill">
            <span className="applied-pill__dot">
              <IconCheck size={11} strokeWidth={3} />
            </span>
            {appliedLabel(total)}
          </span>
        ) : (
          <>
            <span className="diff-table__summary">
              {error ? (
                <span style={{ color: "var(--red)" }}>{error}</span>
              ) : (
                summary || "No changes selected"
              )}
            </span>
            <span className="row" style={{ gap: 6 }}>
              {onCancel && (
                <Button variant="quiet" size="sm" onClick={onCancel} disabled={state === "busy"}>
                  Discard
                </Button>
              )}
              <Button
                variant="accent"
                size="sm"
                disabled={total === 0}
                busy={state === "busy"}
                onClick={() => void apply()}
              >
                {applyLabel(total)}
              </Button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
