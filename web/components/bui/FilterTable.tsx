"use client";

import { useState, type ReactNode } from "react";

/* ─────────────────────────────────────────────────────────
 * FILTER TABLE
 * Status chips directly filter the table. Rows collapse out
 * of view instead of popping, so the table never jumps.
 * ───────────────────────────────────────────────────────── */

export type FilterDef = { key: string; label: string; dot?: string };

export type FilterColumn<R> = {
  key: string;
  label: string;
  /** CSS grid track, e.g. "minmax(0,1.3fr)" */
  width: string;
  render: (row: R) => ReactNode;
  /** muted, tabular cell (dates, counts) */
  muted?: boolean;
};

/** Electric status pill (to do / in progress / done palettes). */
export function FilterStatus({
  tone,
  children,
}: {
  tone: "todo" | "progress" | "done" | "failed" | "neutral";
  children: ReactNode;
}) {
  return <span className={`filter-status filter-status--${tone}`}>{children}</span>;
}

export default function FilterTable<R>({
  rows,
  rowKey,
  rowFilter,
  filters,
  columns,
  label,
  minWidth = 420,
  empty,
  onRowClick,
  toolbar,
}: {
  rows: R[];
  rowKey: (row: R) => string;
  /** the filter key a row belongs to */
  rowFilter: (row: R) => string;
  filters: FilterDef[];
  columns: FilterColumn<R>[];
  label: string;
  minWidth?: number;
  empty?: ReactNode;
  onRowClick?: (row: R) => void;
  /** right side of the filter strip */
  toolbar?: ReactNode;
}) {
  const [filter, setFilter] = useState("all");
  const template = columns.map((c) => c.width).join(" ");
  const counts: Record<string, number> = { all: rows.length };
  for (const r of rows) counts[rowFilter(r)] = (counts[rowFilter(r)] ?? 0) + 1;
  const visibleCount = filter === "all" ? rows.length : (counts[filter] ?? 0);

  return (
    <div className="filter-table">
      <div className="filter-table__strip">
        <div className="filter-table__chips" role="toolbar" aria-label={`${label} filters`}>
          {[{ key: "all", label: "All" }, ...filters].map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className="filter-chip"
              >
                {"dot" in f && f.dot && (
                  <span className="filter-chip__dot" style={{ background: f.dot }} />
                )}
                {f.label}
                <span className="filter-chip__count">{counts[f.key] ?? 0}</span>
              </button>
            );
          })}
        </div>
        {toolbar}
      </div>

      <div aria-label={label} className="filter-table__scroll card" role="region" tabIndex={0}>
        <div style={{ minWidth }}>
          <div
            className="filter-table__row filter-table__row--head"
            style={{ gridTemplateColumns: template }}
          >
            {columns.map((c) => (
              <span key={c.key} className="filter-table__cell">
                {c.label}
              </span>
            ))}
          </div>
          {rows.map((row) => {
            const shown = filter === "all" || rowFilter(row) === filter;
            return (
              <div key={rowKey(row)} className="collapse" data-open={shown}>
                <div className="collapse__inner">
                  <div
                    className={`filter-table__row${onRowClick ? " is-clickable" : ""}`}
                    style={{ gridTemplateColumns: template }}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((c, i) => (
                      <span
                        key={c.key}
                        className={`filter-table__cell${i === 0 ? " filter-table__cell--first" : ""}${c.muted ? " filter-table__cell--muted" : ""}`}
                      >
                        {c.render(row)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          {visibleCount === 0 && (
            <div className="filter-table__empty">{empty ?? "Nothing here yet"}</div>
          )}
        </div>
      </div>
    </div>
  );
}
