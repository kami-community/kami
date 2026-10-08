"use client";

import { useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * STREAM TEXT — reusable streaming primitive
 * Reveals characters quickly (fast, like a real token stream);
 * the leading edge resolves out of a soft blur, and the caret
 * stays solid while streaming, then blinks once the text
 * settles. Inherits typography from its context.
 *
 * Kami change: `text` may grow while streaming (live tokens) —
 * the reveal continues from where it is instead of restarting.
 * ───────────────────────────────────────────────────────── */

export default function StreamText({
  text,
  charsPerTick = 2,
  tickMs = 9,
  blurTail = 6,
  caret = true,
  className,
  onProgress,
  onDone,
}: {
  text: string;
  /** characters revealed per tick — higher is faster */
  charsPerTick?: number;
  /** interval between reveals, ms */
  tickMs?: number;
  /** how many trailing characters carry the soft blur edge */
  blurTail?: number;
  /** render the caret (solid while streaming, blinks once idle) */
  caret?: boolean;
  className?: string;
  /** fires each tick — useful for re-anchoring UI to reflowing text */
  onProgress?: () => void;
  /** fires once the full string is shown */
  onDone?: () => void;
}) {
  const [count, setCount] = useState(0);
  const onProgressRef = useRef(onProgress);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onProgressRef.current = onProgress;
    onDoneRef.current = onDone;
  });

  // A different string (not an extension of the shown one) restarts the reveal.
  const [base, setBase] = useState(text);
  if (!text.startsWith(base.slice(0, count))) {
    setBase(text);
    setCount(0);
  } else if (base !== text) {
    setBase(text);
  }

  useEffect(() => {
    if (count >= text.length) return;
    const id = setTimeout(() => {
      const next = Math.min(count + charsPerTick, text.length);
      setCount(next);
      onProgressRef.current?.();
      if (next >= text.length) onDoneRef.current?.();
    }, tickMs);
    return () => clearTimeout(id);
  }, [count, text, charsPerTick, tickMs]);

  const streaming = count < text.length;
  const shown = text.slice(0, count);
  const split = streaming ? Math.max(0, shown.length - blurTail) : shown.length;

  return (
    <span className={className}>
      {shown.slice(0, split)}
      {split < shown.length && <span className="stream-tail">{shown.slice(split)}</span>}
      {caret && <span aria-hidden className={`stream-caret${streaming ? " is-streaming" : ""}`} />}
    </span>
  );
}
