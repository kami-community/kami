"use client";

import { useCallback, useState, type ReactNode } from "react";
import { IconCheck, IconCode, IconCopy } from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * CODE BLOCK
 * A light editor panel with two versions:
 *   · Code — a line-numbered listing
 *   · Diff — a unified diff: one gutter, a green/red accent
 *     bar and row tint, plus word-level add/del highlights.
 * Both share syntax coloring, insets, and wrapping behavior.
 * ───────────────────────────────────────────────────────── */

export type CodePiece = { text: string; change?: "add" | "del" };

export type CodeDiffRow = {
  old: number | null;
  cur: number | null;
  type: "ctx" | "add" | "del";
  pieces: CodePiece[];
};

const HATCH =
  "repeating-linear-gradient(45deg, var(--red) 0, var(--red) 1.5px, transparent 1.5px, transparent 3px)";

/* light syntax coloring — keywords, functions, strings & numbers, JSON keys */
const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "default",
  "async",
  "function",
  "const",
  "let",
  "var",
  "await",
  "return",
  "if",
  "else",
  "for",
  "while",
  "new",
  "throw",
  "try",
  "catch",
  "null",
  "true",
  "false",
  "undefined",
]);
const TOKEN =
  /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\b\d+(?:\.\d+)?\b|\b(?:import|from|export|default|async|function|const|let|var|await|return|if|else|for|while|new|throw|try|catch|null|true|false|undefined)\b|[A-Za-z_$][\w$]*(?=\s*\())/g;

function highlight(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    const t = m[0];
    if (idx > last) nodes.push(<span key={k++}>{text.slice(last, idx)}</span>);
    let color: string;
    let weight: number | undefined;
    const isKey = /^"/.test(t) && /^\s*:/.test(text.slice(idx + t.length));
    if (isKey) color = "var(--accent-ink)";
    else if (/^["'`]/.test(t) || /^\d/.test(t)) color = "var(--orange)";
    else if (KEYWORDS.has(t)) color = "var(--accent-ink)";
    else {
      color = "var(--ink)";
      weight = 500;
    }
    nodes.push(
      <span key={k++} style={{ color, fontWeight: weight }}>
        {t}
      </span>,
    );
    last = idx + t.length;
  }
  if (last < text.length) nodes.push(<span key={k++}>{text.slice(last)}</span>);
  return nodes;
}

function Pieces({ pieces }: { pieces: CodePiece[] }) {
  return (
    <>
      {pieces.map((p, i) =>
        p.change ? (
          <span key={i} className={`code-block__word code-block__word--${p.change}`}>
            {highlight(p.text)}
          </span>
        ) : (
          <span key={i}>{highlight(p.text)}</span>
        ),
      )}
    </>
  );
}

export default function CodeBlock({
  variant = "Code",
  lines = [],
  code,
  diff = [],
  filename,
  maxHeight,
  className,
}: {
  variant?: "Code" | "Diff";
  lines?: string[];
  /** raw text placed on the clipboard; defaults to `lines` joined */
  code?: string;
  diff?: CodeDiffRow[];
  filename: string;
  maxHeight?: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const isDiff = variant === "Diff";
  const raw = code ?? lines.join("\n");

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [raw]);

  const added = diff.filter((r) => r.type === "add").length;
  const removed = diff.filter((r) => r.type === "del").length;

  return (
    <div className={`code-block card${className ? ` ${className}` : ""}`}>
      <div className="code-block__head">
        <span className="code-block__file">
          <IconCode size={15} strokeWidth={1.8} style={{ color: "var(--ink-3)" }} />
          <span className="truncate mono">{filename}</span>
        </span>
        {isDiff ? (
          <span className="code-block__stat mono">
            <span style={{ color: "var(--green)" }}>+{added}</span>
            <span style={{ color: "var(--red)" }}>-{removed}</span>
          </span>
        ) : (
          <button
            type="button"
            aria-label="Copy code"
            onClick={copy}
            className={`code-block__copy${copied ? " is-copied" : ""}`}
          >
            {copied ? <IconCheck size={11} strokeWidth={3} /> : <IconCopy size={11} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      <div
        className="code-block__body mono"
        style={maxHeight ? { maxHeight, overflow: "auto" } : undefined}
      >
        <div className="code-block__lines">
          <span className="code-block__rule" />
          {isDiff
            ? diff.map((r, i) => {
                const add = r.type === "add";
                const del = r.type === "del";
                const num = del ? r.old : r.cur;
                return (
                  <div
                    key={i}
                    className={`code-block__row${add ? " is-add" : del ? " is-del" : ""}`}
                  >
                    {(add || del) && (
                      <span
                        className="code-block__bar"
                        style={{ background: add ? "var(--green)" : HATCH }}
                      />
                    )}
                    <span className="code-block__num">{num ?? ""}</span>
                    <code className="code-block__code">
                      <Pieces pieces={r.pieces} />
                    </code>
                  </div>
                );
              })
            : lines.map((line, i) => (
                <div key={i} className="code-block__row">
                  <span className="code-block__num">{i + 1}</span>
                  <code className="code-block__code">{highlight(line)}</code>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
