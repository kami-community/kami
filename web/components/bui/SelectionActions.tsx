"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import StreamText from "@/components/bui/StreamText";
import {
  IconArrowUp,
  IconCheck,
  IconChevronRight,
  IconClose,
  IconRetry,
  IconSparkle,
  IconWand,
  IconLines,
  IconUser,
} from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * SELECTION ACTIONS
 * A contextual AI bar attached beneath selected text. Select
 * a passage of the text, pick an action (or describe an edit),
 * and the agent's rewrite streams into place; Keep commits it,
 * Discard restores the original.
 *
 * Kami: the passage is real text; `onRewrite` calls the server
 * and `onCommit` saves the edited text.
 * ───────────────────────────────────────────────────────── */

export type SelectionAction = {
  id: string;
  icon: ReactNode;
  /** instruction sent to the agent; omit for a no-op */
  action?: string;
  /** gerund shown while it runs */
  busyLabel?: string;
};

export type SelectionActionSet = { primary: SelectionAction[]; more: SelectionAction[] };

const ICON = { size: 14, strokeWidth: 1.8 } as const;

export const DEFAULT_SELECTION_ACTIONS: SelectionActionSet = {
  primary: [
    { id: "Improve", icon: <IconSparkle size={13} />, action: "Improve", busyLabel: "Improving" },
  ],
  more: [
    { id: "Shorten", icon: <IconLines {...ICON} />, action: "Shorten", busyLabel: "Shortening" },
    {
      id: "Warmer",
      icon: <IconUser {...ICON} />,
      action: "Make the tone warmer",
      busyLabel: "Warming up",
    },
    { id: "Grammar", icon: <IconWand {...ICON} />, action: "Fix grammar", busyLabel: "Fixing" },
  ],
};

type Mode = "idle" | "thinking" | "streaming" | "result";

type Range = { start: number; end: number };

export default function SelectionActions({
  text,
  onRewrite,
  onCommit,
  actions = DEFAULT_SELECTION_ACTIONS,
  labels,
  disabled = false,
  className,
}: {
  /** the passage the founder can select from */
  text: string;
  /** returns the replacement for `selection` given an instruction */
  onRewrite: (args: { text: string; selection: string; instruction: string }) => Promise<string>;
  /** saves the full edited text */
  onCommit: (next: string) => void | Promise<void>;
  actions?: SelectionActionSet;
  labels?: Partial<{ keep: string; discard: string; placeholder: string }>;
  disabled?: boolean;
  className?: string;
}) {
  const copy = { keep: "Keep", discard: "Discard", placeholder: "Describe edits", ...labels };
  const [range, setRange] = useState<Range | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [action, setAction] = useState("Improve");
  const [rewrite, setRewrite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const [positioned, setPositioned] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const selectionRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const previousModeRef = useRef<Mode>("idle");
  const lastWidthRef = useRef(0);
  const widthAnimationRef = useRef<Animation | null>(null);

  /* Attach beneath the final selected line, centered on the selection. */
  const place = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const host = hostRef.current;
      const selection = selectionRef.current;
      if (!host || !selection) return;
      const bounds = selection.getBoundingClientRect();
      const lastLine = Array.from(selection.getClientRects()).at(-1);
      if (!lastLine) return;
      const hostBounds = host.getBoundingClientRect();
      const next = {
        x: Math.round(
          Math.min(
            Math.max(bounds.left - hostBounds.left + bounds.width / 2, 150),
            Math.max(150, hostBounds.width - 150),
          ),
        ),
        y: Math.round(lastLine.bottom - hostBounds.top + 8),
      };
      setAnchor((current) => (current.x === next.x && current.y === next.y ? current : next));
      setPositioned(true);
    });
  }, []);

  useLayoutEffect(() => {
    if (range) place();
  }, [mode, range, place]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(place);
    observer.observe(host);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [place]);

  /* Animate the bar between the intrinsic widths of idle, loading and result. */
  useLayoutEffect(() => {
    const bar = barRef.current;
    const content = contentRef.current;
    if (!bar || !content) return;
    const nextWidth = Math.ceil(content.getBoundingClientRect().width) + 8;
    const previousWidth = lastWidthRef.current || Math.ceil(bar.getBoundingClientRect().width);
    if (previousModeRef.current !== mode && Math.abs(nextWidth - previousWidth) > 1) {
      widthAnimationRef.current?.cancel();
      const animation = bar.animate(
        [{ width: `${previousWidth}px` }, { width: `${nextWidth}px` }],
        {
          duration: 320,
          easing: "cubic-bezier(0.23,1,0.32,1)",
        },
      );
      widthAnimationRef.current = animation;
      animation.onfinish = () => {
        lastWidthRef.current = nextWidth;
        widthAnimationRef.current = null;
      };
    } else {
      lastWidthRef.current = nextWidth;
    }
    previousModeRef.current = mode;
  }, [mode, range]);

  /* Map a DOM selection inside the passage to character offsets. */
  function captureSelection() {
    if (disabled || mode !== "idle") return;
    const sel = window.getSelection();
    const root = textRef.current;
    if (!sel || sel.rangeCount === 0 || !root) return;
    const r = sel.getRangeAt(0);
    if (r.collapsed || !root.contains(r.startContainer) || !root.contains(r.endContainer)) return;
    const pre = document.createRange();
    pre.selectNodeContents(root);
    pre.setEnd(r.startContainer, r.startOffset);
    const start = pre.toString().length;
    const end = start + r.toString().length;
    if (end - start < 3) return;
    setRange({ start, end });
    setPositioned(false);
    sel.removeAllRanges();
  }

  async function run(instruction: string) {
    if (!range) return;
    setAction(instruction);
    setExpanded(false);
    setError(null);
    setMode("thinking");
    try {
      const next = await onRewrite({
        text,
        selection: text.slice(range.start, range.end),
        instruction,
      });
      setRewrite(next);
      setMode("streaming");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The rewrite failed");
      setMode("idle");
    }
  }

  function reset() {
    setExpanded(false);
    setPrompt("");
    setAction("Improve");
    setMode("idle");
    setRewrite("");
    setRange(null);
    setPositioned(false);
  }

  async function keep() {
    if (!range) return;
    const next = text.slice(0, range.start) + rewrite + text.slice(range.end);
    reset();
    await onCommit(next);
  }

  const busy = mode === "thinking" || mode === "streaming";
  const visible = Boolean(range) && positioned;
  const hasPrompt = prompt.trim().length > 0;
  const busyLabel =
    [...actions.primary, ...actions.more].find((a) => a.action === action)?.busyLabel ?? "Editing";

  const before = range ? text.slice(0, range.start) : text;
  const picked = range ? text.slice(range.start, range.end) : "";
  const after = range ? text.slice(range.end) : "";

  return (
    <div className={`selection-actions${className ? ` ${className}` : ""}`}>
      <div ref={hostRef} className="selection-actions__host" data-active={Boolean(range)}>
        <p
          ref={textRef}
          className="selection-actions__text"
          onMouseUp={captureSelection}
          onKeyUp={(e) => {
            if (e.shiftKey) captureSelection();
          }}
        >
          {before}
          {range && (
            <span ref={selectionRef} className="selection-actions__mark">
              {mode === "streaming" ? (
                <StreamText text={rewrite} onProgress={place} onDone={() => setMode("result")} />
              ) : mode === "result" ? (
                rewrite
              ) : (
                picked
              )}
            </span>
          )}
          {after}
        </p>
        {!range && !disabled && (
          <p className="selection-actions__hint">Select any passage to rewrite it with Kami.</p>
        )}
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}

        <div
          className="selection-actions__anchor"
          style={{
            transform: `translate3d(${anchor.x}px, ${anchor.y}px, 0) translateX(-50%)`,
            opacity: visible ? 1 : 0,
            pointerEvents: visible ? "auto" : "none",
          }}
        >
          {/* A 36px pill wraps 28px controls at a 4px inset — concentric curves. */}
          <div
            ref={barRef}
            className="selection-bar"
            style={visible ? { animation: "pop-in 220ms var(--ease-out-strong) both" } : undefined}
          >
            <div ref={contentRef} className="selection-bar__content">
              {busy && (
                <span className="selection-bar__busy">
                  <span className="spinner" />
                  {mode === "thinking" ? (
                    <span className="shimmer">{busyLabel}…</span>
                  ) : (
                    <span>{busyLabel}…</span>
                  )}
                </span>
              )}

              {mode === "result" && (
                <>
                  <button type="button" onClick={() => void keep()} className="selection-bar__keep">
                    <IconCheck {...ICON} />
                    {copy.keep}
                  </button>
                  <Button variant="quiet" size="xs" onClick={reset}>
                    <IconClose {...ICON} />
                    {copy.discard}
                  </Button>
                  <span className="selection-bar__rule" />
                  <button
                    type="button"
                    aria-label="Try again"
                    onClick={() => void run(action)}
                    className="selection-bar__round"
                  >
                    <IconRetry {...ICON} />
                  </button>
                </>
              )}

              {mode === "idle" && range && (
                <>
                  <div
                    className="selection-bar__slot"
                    style={{
                      maxWidth: expanded ? 0 : hasPrompt ? 240 : 145,
                      opacity: expanded ? 0 : 1,
                      transform: expanded ? "translateX(-8px)" : "translateX(0)",
                    }}
                  >
                    <form
                      className="selection-bar__form"
                      style={{ width: hasPrompt ? 240 : 145 }}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run(prompt.trim() || "Improve");
                      }}
                    >
                      <input
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        aria-label={copy.placeholder}
                        placeholder={copy.placeholder}
                        className="selection-bar__input"
                      />
                    </form>
                  </div>
                  <div
                    className="selection-bar__slot"
                    style={{
                      maxWidth: hasPrompt ? 0 : expanded ? 520 : 224,
                      opacity: hasPrompt ? 0 : 1,
                      transform: hasPrompt ? "translateX(-8px)" : "translateX(0)",
                      gap: 2,
                    }}
                  >
                    {!expanded && (
                      <span className="selection-bar__rule selection-bar__rule--strong" />
                    )}
                    {actions.primary.map((item) => (
                      <Button
                        key={item.id}
                        variant="quiet"
                        size="xs"
                        onClick={item.action ? () => void run(item.action!) : undefined}
                      >
                        {item.icon}
                        {item.id}
                      </Button>
                    ))}
                    <div
                      className="selection-bar__slot"
                      style={{
                        maxWidth: expanded ? 360 : 0,
                        opacity: expanded ? 1 : 0,
                        marginLeft: expanded ? 2 : 0,
                        gap: 2,
                      }}
                    >
                      {actions.more.map((item) => (
                        <Button
                          key={item.id}
                          variant="quiet"
                          size="xs"
                          onClick={item.action ? () => void run(item.action!) : undefined}
                        >
                          {item.icon}
                          {item.id}
                        </Button>
                      ))}
                    </div>
                    <span className="selection-bar__rule" />
                    <button
                      type="button"
                      aria-label={expanded ? "Show fewer actions" : "Show more actions"}
                      aria-expanded={expanded}
                      onClick={() => setExpanded((value) => !value)}
                      className="selection-bar__round selection-bar__round--ink"
                    >
                      <span
                        className="row"
                        style={{
                          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 400ms var(--ease-out-strong)",
                        }}
                      >
                        <IconChevronRight {...ICON} />
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Cancel selection"
                      onClick={reset}
                      className="selection-bar__round"
                    >
                      <IconClose {...ICON} />
                    </button>
                  </div>
                  <div
                    className="selection-bar__slot"
                    style={{
                      maxWidth: hasPrompt ? 30 : 0,
                      opacity: hasPrompt ? 1 : 0,
                      transform: hasPrompt ? "scale(1)" : "scale(0.88)",
                    }}
                  >
                    <button
                      type="button"
                      aria-label="Send edit instruction"
                      onClick={() => void run(prompt.trim())}
                      className="selection-bar__send"
                    >
                      <IconArrowUp size={16} strokeWidth={2.4} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
