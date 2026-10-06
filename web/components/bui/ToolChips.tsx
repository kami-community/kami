"use client";

import { useState, type ReactNode, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import {
  IconChevronDown,
  IconDoc,
  IconEdit,
  IconSparkle,
  IconTerminal,
} from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * TOOL CHIPS
 * An agent run as compact rows: tool calls with inline chips,
 * then artifact chips summarizing what it produced. Hover a
 * row to reveal its chevron; every row expands to show what
 * the tool actually did. Hovering an artifact chip previews it.
 * ───────────────────────────────────────────────────────── */

export type ToolIcon = "think" | "write" | "run" | "read";

const ICONS: Record<ToolIcon, ReactNode> = {
  think: <IconSparkle size={13} />,
  write: <IconEdit size={13} />,
  run: <IconTerminal size={13} />,
  read: <IconDoc size={13} />,
};

export type ToolDetailLine = { text: string; tone?: "add" | "del" | "muted" };

export type ToolStep = {
  key: string;
  icon: ToolIcon;
  label: ReactNode;
  chip: string;
  mono?: boolean;
  detailMono?: boolean;
  detail: ToolDetailLine[];
  /** red label for failed calls */
  failed?: boolean;
};

export type ToolArtifact = {
  key: string;
  label: string;
  add?: number;
  del?: number;
  lines?: { text: string; tone: "add" | "del" | "ctx" }[];
};

export default function ToolChips({
  steps,
  artifacts = [],
  header,
  more,
  defaultOpen = true,
  className,
}: {
  steps: ToolStep[];
  artifacts?: ToolArtifact[];
  header: string;
  /** "+2 more" link after the artifact chips */
  more?: { label: string; onClick: () => void };
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  /* Rendered in a body portal so animated wrappers cannot redefine the
   * fixed-position coordinate system. */
  const [preview, setPreview] = useState<{
    key: string;
    x: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  const openPreview = (artifact: ToolArtifact) => (event: SyntheticEvent) => {
    if (!artifact.lines?.length) return;
    const rect = (event.currentTarget as Element)
      .closest("[data-diffchip]")!
      .getBoundingClientRect();
    const previewHeight = 38 + artifact.lines.length * 19;
    const fitsBelow = rect.bottom + 6 + previewHeight <= window.innerHeight - 12;
    setPreview({
      key: artifact.key,
      x: Math.max(12, Math.min(rect.left, window.innerWidth - 300)),
      ...(fitsBelow ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }),
    });
  };
  const closePreview = (key: string) => () =>
    setPreview((current) => (current?.key === key ? null : current));

  const toggleRow = (key: string) =>
    setOpenRows((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const previewed = preview ? artifacts.find((a) => a.key === preview.key) : undefined;

  return (
    <div className={`tool-chips${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((c) => !c)}
        className="tool-chips__header"
      >
        <IconChevronDown
          size={12}
          strokeWidth={2.2}
          style={{
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 200ms",
          }}
        />
        <span className="tabular">{header}</span>
      </button>

      <div className="collapse" data-open={open}>
        <div className="collapse__inner tool-chips__clip">
          <div className="tool-chips__rows">
            {steps.map((row, i) => {
              const rowOpen = openRows.has(row.key);
              return (
                <div
                  key={row.key}
                  style={{
                    animation: `fade-up 300ms var(--ease-out-strong) ${Math.min(i, 8) * 60}ms both`,
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={rowOpen}
                    onClick={() => toggleRow(row.key)}
                    className="tool-row"
                    data-open={rowOpen}
                  >
                    <span className="tool-row__icon">
                      <span className="tool-row__glyph">{ICONS[row.icon]}</span>
                      <IconChevronDown
                        size={12}
                        strokeWidth={2.2}
                        className="tool-row__chevron"
                        style={{ transform: rowOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                      />
                    </span>
                    <span
                      className={`tool-row__label${row.failed ? " tool-row__label--failed" : ""}`}
                    >
                      {row.label}
                    </span>
                    <span className={`tool-row__chip${row.mono ? " mono" : ""}`}>{row.chip}</span>
                  </button>

                  <div className="collapse" data-open={rowOpen}>
                    <div className="collapse__inner">
                      <div className="tool-row__detail">
                        {row.detail.map((line, j) => (
                          <span
                            key={j}
                            className={`tool-row__line${row.detailMono ? " mono" : ""} tool-row__line--${line.tone ?? "plain"}`}
                          >
                            {line.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {artifacts.length > 0 && (
            <div className="tool-chips__artifacts">
              {artifacts.map((d, i) => (
                <span
                  key={d.key}
                  data-diffchip
                  className="tool-chips__artifact-wrap"
                  onMouseEnter={openPreview(d)}
                  onMouseLeave={closePreview(d.key)}
                >
                  <button
                    type="button"
                    aria-expanded={preview?.key === d.key}
                    aria-label={`Preview ${d.label}`}
                    onFocus={openPreview(d)}
                    onBlur={closePreview(d.key)}
                    className="tool-chips__artifact mono"
                    style={{ animation: `pop-in 250ms var(--ease-out-strong) ${i * 80}ms both` }}
                  >
                    <span className="truncate">{d.label}</span>
                    {d.add !== undefined && <span className="tool-chips__add">+{d.add}</span>}
                    {d.del !== undefined && d.del > 0 && (
                      <span className="tool-chips__del">−{d.del}</span>
                    )}
                  </button>
                </span>
              ))}
              {more && (
                <button type="button" className="tool-chips__more mono" onClick={more.onClick}>
                  {more.label}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {preview &&
        previewed?.lines &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="tool-preview"
            style={{
              left: preview.x,
              top: preview.top,
              bottom: preview.bottom,
              transformOrigin: preview.top === undefined ? "bottom left" : "top left",
            }}
          >
            <div className="tool-preview__bar mono">
              <span className="truncate text-2">{previewed.label}</span>
              <span className="tabular">
                {previewed.add !== undefined && (
                  <span style={{ color: "var(--green)" }}>+{previewed.add}</span>
                )}
                {(previewed.del ?? 0) > 0 && (
                  <span style={{ color: "var(--red)" }}> −{previewed.del}</span>
                )}
              </span>
            </div>
            <div className="tool-preview__lines mono">
              {previewed.lines.map((line, index) => (
                <div key={index} className={`tool-preview__line tool-preview__line--${line.tone}`}>
                  <span className="tool-preview__sign">
                    {line.tone === "add" ? "+" : line.tone === "del" ? "−" : " "}
                  </span>
                  <span className="truncate">{line.text}</span>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
