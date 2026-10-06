"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { IconArrowUpRight, IconCheck } from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * RECORDS TABLE — a CRM-style grid with tags, sorting, and
 * relationship status. Row numbers sit in the gutter at rest;
 * the checkbox takes their place on hover or once selected.
 * Columns resize from their right edge; the anchor column is
 * sticky while both axes scroll; a footer row carries counts.
 * ───────────────────────────────────────────────────────── */

export type RecordColumn<R> = {
  key: string;
  label: string;
  icon?: ReactNode;
  width: number;
  minWidth?: number;
  /** enables the header sort arrow */
  sort?: (a: R, b: R) => number;
  render: (row: R) => ReactNode;
  /** muted cell text */
  muted?: (row: R) => boolean;
  wrap?: boolean;
  footer?: (rows: R[]) => ReactNode;
};

type SortState = { key: string; dir: 1 | -1 } | null;

function Checkbox({
  checked,
  mixed = false,
  onChange,
  label,
}: {
  checked: boolean;
  mixed?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="records-checkbox" title={label} onClick={(event) => event.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} />
      <span className={`records-checkbox-box ${checked || mixed ? "is-active" : ""}`}>
        {mixed ? (
          <span className="records-checkbox-dash" />
        ) : checked ? (
          <IconCheck size={12} strokeWidth={1.8} />
        ) : null}
      </span>
    </label>
  );
}

/* ── cell renderers ──────────────────────────────────────── */

const TAG_PALETTE = [
  "oklch(0.76 0.13 70)",
  "oklch(0.62 0.18 293)",
  "oklch(0.72 0.10 221)",
  "oklch(0.70 0.13 162)",
  "oklch(0.71 0.16 48)",
  "oklch(0.66 0.21 323)",
  "oklch(0.80 0.15 101)",
  "oklch(0.64 0.19 27)",
  "oklch(0.77 0.16 122)",
  "oklch(0.67 0.19 3)",
];

/** Stable hue for a tag name, so "Fintech" is always the same color. */
export function tagBase(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 33 + name.charCodeAt(i)) | 0;
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
}

export function RecordTag({ name, base }: { name: string; base?: string }) {
  return (
    <span className="records-tag" style={{ "--tag-base": base ?? tagBase(name) } as CSSProperties}>
      {name}
    </span>
  );
}

/** Tags that fit the cell, then "+N" for the rest (measured, not guessed). */
export function TagList({ tags }: { tags: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const update = () => {
      const available = container.clientWidth;
      const tagWidths = Array.from(
        measure.querySelectorAll<HTMLElement>("[data-tag-measure]"),
        (tag) => tag.offsetWidth,
      );
      const moreWidth = measure.querySelector<HTMLElement>("[data-more-measure]")?.offsetWidth ?? 0;
      let used = 0;
      let count = 0;
      for (let index = 0; index < tagWidths.length; index += 1) {
        const nextUsed = used + (count > 0 ? 4 : 0) + tagWidths[index];
        const hiddenAfter = tags.length - (index + 1);
        const totalWithOverflow = nextUsed + (hiddenAfter > 0 ? 4 + moreWidth : 0);
        if (totalWithOverflow > available) break;
        used = nextUsed;
        count += 1;
      }
      setVisibleCount(count);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [tags]);

  const hiddenCount = tags.length - visibleCount;
  if (!tags.length) return <span className="records-muted">—</span>;

  return (
    <div ref={containerRef} className="records-tags" title={tags.join(", ")}>
      <div ref={measureRef} className="records-tags-measure" aria-hidden>
        {tags.map((tag) => (
          <span key={tag} data-tag-measure>
            <RecordTag name={tag} />
          </span>
        ))}
        <span data-more-measure className="records-more-tag">
          +{tags.length}
        </span>
      </div>
      {tags.slice(0, visibleCount).map((tag) => (
        <RecordTag key={tag} name={tag} />
      ))}
      {hiddenCount > 0 && <span className="records-more-tag">+{hiddenCount}</span>}
    </div>
  );
}

/** Dot + label strength / status cell. */
export function Strength({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="records-strength">
      <span className="records-strength-dot" style={{ background: color }} />
      {children}
    </span>
  );
}

/** An external link cell (domain → https). */
export function RecordLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="records-link" href={href} title={label} target="_blank" rel="noreferrer">
      <span className="records-link-label">{label}</span>
      <IconArrowUpRight size={12} strokeWidth={1.8} />
    </a>
  );
}

/** "Calculating…" placeholder for a cell an agent is still filling. */
export function CalcCell({ label = "Calculating…" }: { label?: string }) {
  return (
    <span className="records-calc">
      <span className="records-muted">{label}</span>
      <span className="records-pulse" />
    </span>
  );
}

/* ── table ──────────────────────────────────────────────── */

export default function RecordsTable<R>({
  rows,
  rowId,
  anchor,
  columns,
  label,
  selected,
  onSelectedChange,
  actions,
  actionsWidth = 120,
  countLabel = "count",
  maxHeight = 438,
  empty,
}: {
  rows: R[];
  rowId: (row: R) => string;
  /** the sticky first column (company / person) */
  anchor: {
    label: string;
    width?: number;
    name: (row: R) => string;
    href?: (row: R) => string | null;
    mark?: (row: R) => ReactNode;
    sort?: (a: R, b: R) => number;
  };
  columns: RecordColumn<R>[];
  /** accessible name for the scroll region */
  label: string;
  /** controlled selection (omit both to hide checkboxes) */
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  /** trailing per-row actions */
  actions?: (row: R) => ReactNode;
  actionsWidth?: number;
  countLabel?: string;
  maxHeight?: number | "none";
  empty?: ReactNode;
}) {
  const selectable = Boolean(selected && onSelectedChange);
  const [sort, setSort] = useState<SortState>(null);
  const [widths, setWidths] = useState<Record<string, number>>(() => ({
    __anchor: anchor.width ?? 270,
    ...Object.fromEntries(columns.map((c) => [c.key, c.width])),
  }));
  const [resizing, setResizing] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const cmp =
      sort.key === "__anchor" ? anchor.sort : columns.find((c) => c.key === sort.key)?.sort;
    if (!cmp) return rows;
    return [...rows].sort((a, b) => cmp(a, b) * sort.dir);
  }, [rows, sort, columns, anchor.sort]);

  const sel = selected ?? new Set<string>();
  const allSelected = sorted.length > 0 && sorted.every((row) => sel.has(rowId(row)));
  const partiallySelected = !allSelected && sorted.some((row) => sel.has(rowId(row)));

  const toggleSort = (key: string) =>
    setSort((current) =>
      current?.key === key ? { key, dir: (current.dir * -1) as 1 | -1 } : { key, dir: 1 },
    );

  const startResize =
    (key: string, minWidth = 120) =>
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = widths[key] ?? 160;
      const previousCursor = document.body.style.cursor;
      const previousSelection = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      setResizing(key);
      const move = (moveEvent: PointerEvent) => {
        const width = Math.max(minWidth, startWidth + moveEvent.clientX - startX);
        setWidths((current) => ({ ...current, [key]: width }));
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousSelection;
        setResizing(null);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    };

  const toggleRow = (id: string) => {
    if (!onSelectedChange) return;
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };
  const toggleAll = () => {
    if (!onSelectedChange) return;
    const next = new Set(sel);
    if (allSelected) sorted.forEach((row) => next.delete(rowId(row)));
    else sorted.forEach((row) => next.add(rowId(row)));
    onSelectedChange(next);
  };

  const tableWidth =
    widths.__anchor +
    columns.reduce((sum, c) => sum + (widths[c.key] ?? c.width), 0) +
    (actions ? actionsWidth : 0);

  const sortArrow = (key: string, text: string) => (
    <span
      role="button"
      tabIndex={0}
      aria-label={`Sort by ${text}`}
      onClick={(event) => {
        event.stopPropagation();
        toggleSort(key);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          toggleSort(key);
        }
      }}
      className={`records-sort ${sort?.key === key ? "is-visible" : ""}`}
      style={{ transform: sort?.key === key && sort.dir === -1 ? "rotate(180deg)" : undefined }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    </span>
  );

  return (
    <div className="records-shell">
      <div
        className="records-scroll"
        tabIndex={0}
        role="region"
        aria-label={label}
        style={{ maxHeight: maxHeight === "none" ? "none" : maxHeight }}
      >
        <table className="records-table" style={{ width: "100%", minWidth: tableWidth }}>
          <colgroup>
            <col style={{ width: widths.__anchor }} />
            {columns.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] ?? c.width }} />
            ))}
            {actions && <col style={{ width: actionsWidth }} />}
          </colgroup>
          <thead>
            <tr>
              <th className="records-header-cell records-sticky-cell">
                <div className="records-company-header">
                  {selectable ? (
                    <Checkbox
                      checked={allSelected}
                      mixed={partiallySelected}
                      onChange={toggleAll}
                      label={`Select all ${anchor.label.toLowerCase()}`}
                    />
                  ) : (
                    <span style={{ width: 4 }} />
                  )}
                  <span>{anchor.label}</span>
                  {anchor.sort && sortArrow("__anchor", anchor.label)}
                </div>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${anchor.label} column`}
                  className={`records-resize-handle ${resizing === "__anchor" ? "is-resizing" : ""}`}
                  onPointerDown={startResize("__anchor", 180)}
                />
              </th>
              {columns.map((c) => (
                <th key={c.key} className="records-header-cell" style={{ position: "sticky" }}>
                  <button
                    type="button"
                    className="records-header-button"
                    onClick={c.sort ? () => toggleSort(c.key) : undefined}
                  >
                    {c.icon && <span className="records-header-icon">{c.icon}</span>}
                    <span className="truncate">{c.label}</span>
                    {c.sort && sortArrow(c.key, c.label)}
                  </button>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${c.label} column`}
                    className={`records-resize-handle ${resizing === c.key ? "is-resizing" : ""}`}
                    onPointerDown={startResize(c.key, c.minWidth)}
                  />
                </th>
              ))}
              {actions && <th className="records-header-cell" />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, index) => {
              const id = rowId(row);
              const selectedRow = sel.has(id);
              const name = anchor.name(row);
              const href = anchor.href?.(row) ?? null;
              return (
                <tr key={id} className={`records-row ${selectedRow ? "is-selected" : ""}`}>
                  <td className="records-cell records-sticky-cell records-company-cell">
                    {selectable ? (
                      <>
                        <span className="records-rownum">{index + 1}</span>
                        <Checkbox
                          checked={selectedRow}
                          onChange={() => toggleRow(id)}
                          label={`Select ${name}`}
                        />
                      </>
                    ) : (
                      <span className="records-rownum" style={{ display: "inline-flex" }}>
                        {index + 1}
                      </span>
                    )}
                    {anchor.mark ? (
                      anchor.mark(row)
                    ) : (
                      <span className="records-company-mark">{name.slice(0, 1).toUpperCase()}</span>
                    )}
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        title={name}
                        className="records-company-name has-link"
                      >
                        {name}
                      </a>
                    ) : (
                      <span title={name} className="records-company-name">
                        {name}
                      </span>
                    )}
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`records-cell${c.muted?.(row) ? " records-muted" : ""}${c.wrap ? " records-cell--wrap" : ""}`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                  {actions && (
                    <td className="records-cell">
                      <div className="records-actions">{actions(row)}</div>
                    </td>
                  )}
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1 + (actions ? 1 : 0)} className="records-empty">
                  {empty ?? "No records yet"}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="records-calculation-row">
              <td className="records-cell records-sticky-cell">
                <span className="records-footer-value records-calculation-label">
                  <span className="records-calculation-number">{rows.length}</span> {countLabel}
                </span>
              </td>
              {columns.map((c) => (
                <td key={c.key} className="records-cell records-muted">
                  <span className="records-footer-value">{c.footer ? c.footer(rows) : "—"}</span>
                </td>
              ))}
              {actions && <td className="records-cell" />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
