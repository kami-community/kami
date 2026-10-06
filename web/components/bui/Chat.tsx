"use client";

import { useRef, type ReactNode } from "react";
import { IconArrowUp, IconStop } from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * CHAT — panel with tabs, replies, and a composer.
 * Pieces are exported separately so a real thread (Kami
 * Guide) can stream into the same shell.
 * ───────────────────────────────────────────────────────── */

export function ChatPanel({
  tabs,
  actions,
  children,
  composer,
  className,
  label,
}: {
  tabs?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  composer: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <section className={`chat${className ? ` ${className}` : ""}`} aria-label={label}>
      <div className="chat__head">
        <div className="chat__tabs">{tabs}</div>
        <div className="chat__actions">{actions}</div>
      </div>
      {children}
      <div className="chat__composer-wrap">{composer}</div>
    </section>
  );
}

/** Header tab chip (Flavors | Suppliers). */
export function ChatTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="chat__tab">
      {children}
    </button>
  );
}

/** Scrolling conversation region — fixed so the panel never changes shape. */
export function ChatThread({
  children,
  threadRef,
}: {
  children: ReactNode;
  threadRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={threadRef} className="chat__thread" aria-live="polite">
      {children}
    </div>
  );
}

/** User bubble — right aligned, soft block. */
export function ChatBubble({ children }: { children: ReactNode }) {
  return (
    <div className="chat__bubble-row">
      <div className="chat__bubble">{children}</div>
    </div>
  );
}

/** Agent reply section: "Label  Sub  for 4s" over the body. */
export function ChatSection({
  label,
  sub,
  time,
  children,
  resolving = false,
}: {
  label: ReactNode;
  sub?: ReactNode;
  time?: string | null;
  children: ReactNode;
  resolving?: boolean;
}) {
  return (
    <div className="chat__section" data-resolving={resolving}>
      <div className="chat__section-meta">
        <span className="chat__section-label">{label}</span>
        {sub && <span className="chat__section-sub">{sub}</span>}
        {time && <span className="chat__section-time">for {time}</span>}
      </div>
      <div className="chat__section-body">{children}</div>
    </div>
  );
}

/** Composer: a soft field with a send (or stop) button. Enter sends. */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  busy = false,
  placeholder,
  label = "Message",
  disabled = false,
  footer,
  enterToSend = true,
  sendLabel = "Send",
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  busy?: boolean;
  placeholder: string;
  label?: string;
  disabled?: boolean;
  /** left side of the composer footer (hints, chips) */
  footer?: ReactNode;
  /** real-world sends (email replies) need the explicit button */
  enterToSend?: boolean;
  sendLabel?: string;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !busy && !disabled;
  return (
    <div role="presentation" onClick={() => inputRef.current?.focus()} className="chat__composer">
      <textarea
        ref={inputRef}
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            enterToSend &&
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        className="chat__input"
      />
      <div className="chat__composer-foot">
        <div className="chat__composer-hint">{footer}</div>
        {busy && onStop ? (
          <button
            type="button"
            aria-label="Stop"
            onClick={onStop}
            className="chat__send chat__send--on"
          >
            <IconStop size={12} />
          </button>
        ) : (
          <button
            type="button"
            aria-label={sendLabel}
            title={sendLabel}
            disabled={!canSend}
            onClick={onSend}
            className={`chat__send${canSend ? " chat__send--on" : ""}`}
          >
            <IconArrowUp size={16} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );
}
