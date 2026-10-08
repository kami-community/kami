"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { IconArrowUp, IconCheck, IconChevronDown, IconPlus, IconStop } from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * PROMPT BAR
 * A composer with real controls: @ context sources, / commands,
 * a picker (model → Kami's focus), dictation, and send.
 * Type @ or / to open the menus; ↑↓ + Enter to pick.
 * Variants: Rounded (card radius) · Pill (full radius).
 * ───────────────────────────────────────────────────────── */

export type PromptSource = { key: string; name: string; desc: string; icon?: ReactNode };
export type PromptCommand = { key: string; name: string; desc: string; prompt: string };
export type PromptOption = { key: string; name: string; tag?: string };

/* the last @word or /word being typed, if any */
function parseToken(draft: string): { kind: "at" | "slash"; query: string; start: number } | null {
  const match = /(^|\s)([@/])([\w-]*)$/.exec(draft);
  if (!match) return null;
  return {
    kind: match[2] === "@" ? "at" : "slash",
    query: match[3].toLowerCase(),
    start: match.index + match[1].length,
  };
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const noopSubscribe = () => () => {};

function speechCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    (new () => SpeechRecognitionLike) | null;
}

export default function PromptBar({
  variant = "Rounded",
  tall = false,
  stacked = false,
  placeholder = "Write a message…",
  sources = [],
  commands = [],
  options,
  option,
  onOptionChange,
  onSend,
  onStop,
  busy = false,
  disabled = false,
  label = "Prompt",
  autoFocus = false,
  value,
  onValueChange,
}: {
  variant?: "Rounded" | "Pill";
  /** hero sizing: a multi-line input with controls on their own row */
  tall?: boolean;
  /** narrow rails: always put the controls on their own row */
  stacked?: boolean;
  placeholder?: string;
  sources?: PromptSource[];
  commands?: PromptCommand[];
  /** the picker (Kami: what the Guide focuses on) */
  options?: PromptOption[];
  option?: string;
  onOptionChange?: (key: string) => void;
  onSend: (text: string) => void;
  onStop?: () => void;
  busy?: boolean;
  disabled?: boolean;
  label?: string;
  autoFocus?: boolean;
  /** controlled draft (optional) */
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const pill = variant === "Pill";
  const [innerDraft, setInnerDraft] = useState("");
  const draft = value ?? innerDraft;
  const setDraft = (next: string) => {
    if (onValueChange) onValueChange(next);
    if (value === undefined) setInnerDraft(next);
  };
  const [dismissed, setDismissed] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [listening, setListening] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const wide = expanded || tall || stacked;
  const [rowBox, setRowBox] = useState<{ top: number; height: number } | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [modelBox, setModelBox] = useState<{ top: number; height: number } | null>(null);
  const [modelHovered, setModelHovered] = useState<number | null>(null);
  const [modelMenuLeft, setModelMenuLeft] = useState(0);
  const [modelMenuBottom, setModelMenuBottom] = useState(0);
  const composerAnchorRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const modelRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const modelRowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const canDictate = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(speechCtor()),
    () => false,
  );

  const token = dismissed ? null : parseToken(draft);
  const menu: "at" | "slash" | null = plusOpen ? "at" : (token?.kind ?? null);
  const query = plusOpen ? "" : (token?.query ?? "");
  const rows: { key: string; name: string; desc: string; icon?: ReactNode }[] =
    menu === "at"
      ? sources.filter((s) => s.name.toLowerCase().includes(query))
      : menu === "slash"
        ? commands.filter((c) => c.name.slice(1).startsWith(query))
        : [];
  const menuOpen = Boolean(menu) && (menu === "at" ? sources.length > 0 : commands.length > 0);

  const [menuKey, setMenuKey] = useState(`${menu}:${query}`);
  if (menuKey !== `${menu}:${query}`) {
    setMenuKey(`${menu}:${query}`);
    setActive(0);
    setEngaged(false);
  }

  /* a single highlight glides to the active row */
  useLayoutEffect(() => {
    const target = rowRefs.current[active];
    if (target) setRowBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [menu, query, active, rows.length]);

  const current = options?.find((o) => o.key === option) ?? options?.[0];
  const modelIndex = options?.findIndex((m) => m.key === current?.key) ?? -1;
  useLayoutEffect(() => {
    if (!modelOpen) return;
    const target = modelRowRefs.current[modelHovered ?? modelIndex];
    if (target) setModelBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [modelOpen, modelHovered, modelIndex]);

  /* align the picker menu to its trigger by measurement */
  useLayoutEffect(() => {
    if (!modelOpen || !composerAnchorRef.current || !modelRef.current) return;
    const anchorRect = composerAnchorRef.current.getBoundingClientRect();
    const triggerRect = modelRef.current.getBoundingClientRect();
    setModelMenuLeft(
      Math.max(0, Math.min(triggerRect.left - anchorRect.left, anchorRect.width - 176)),
    );
    setModelMenuBottom(anchorRect.bottom - triggerRect.top + 8);
  }, [modelOpen, wide, current?.name]);

  /* Move wrapped text above the controls, then grow to a compact maximum. */
  useLayoutEffect(() => {
    const input = inputRef.current;
    const controls = controlsRef.current;
    const measure = measureRef.current;
    if (!input || !controls || !measure) return;
    const fixedControlsWidth = 28 * 3 + (modelRef.current?.offsetWidth ?? 0);
    const inlineInputWidth = controls.clientWidth - fixedControlsWidth - 16;
    const needsFullWidth = draft.includes("\n") || measure.offsetWidth + 8 > inlineInputWidth;
    if (needsFullWidth !== expanded) setExpanded(needsFullWidth);
    const minHeight = tall ? 68 : 28;
    const maxHeight = tall ? 160 : 100;
    input.style.height = "0px";
    const contentHeight = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(contentHeight, minHeight), maxHeight)}px`;
    input.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }, [draft, expanded, tall]);

  /* clicking anywhere outside the composer closes the open menus */
  useEffect(() => {
    if (!modelOpen && !plusOpen) return;
    const close = (event: PointerEvent) => {
      if (!composerAnchorRef.current?.contains(event.target as Node)) {
        setModelOpen(false);
        setPlusOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [modelOpen, plusOpen]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    const before = draft;
    recognition.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) setDraft(before ? `${before.trimEnd()} ${text}` : text);
    };
    recognition.onend = () => {
      setListening(false);
      inputRef.current?.focus();
    };
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  const closeMenus = () => {
    setPlusOpen(false);
    setModelOpen(false);
  };

  const pick = (row: { key: string; name: string }) => {
    if (menu === "at") {
      setDraft(`${token ? draft.slice(0, token.start) : draft}@${row.name} `);
    } else {
      const cmd = commands.find((c) => c.key === row.key);
      setDraft(`${token ? draft.slice(0, token.start) : draft}${cmd?.prompt ?? row.name} `);
    }
    setPlusOpen(false);
    setDismissed(false);
    inputRef.current?.focus();
  };

  const canSend = draft.trim().length > 0 && !busy && !disabled;
  const send = () => {
    if (!canSend) return;
    onSend(draft.trim());
    setDraft("");
    closeMenus();
  };

  const radius = pill ? "is-pill" : "is-rounded";

  return (
    <div className="promptbar">
      <div ref={composerAnchorRef} className="promptbar__anchor">
        {/* ── @ / slash menu ─────────────────────────────── */}
        {menuOpen && (
          <div onMouseLeave={() => setEngaged(false)} className="promptbar__menu">
            <span
              aria-hidden
              className="promptbar__glide"
              style={{
                top: rowBox?.top ?? 0,
                height: rowBox?.height ?? 0,
                opacity: rowBox && engaged && rows.length > 0 ? 1 : 0,
              }}
            />
            {rows.map((row, i) => (
              <button
                key={row.key}
                type="button"
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  setActive(i);
                  setEngaged(true);
                }}
                onClick={() => pick(row)}
                className="promptbar__row"
                data-active={i === active && engaged}
              >
                {row.icon && <span className="promptbar__row-icon">{row.icon}</span>}
                <span className="promptbar__row-name">{row.name}</span>
                <span className="promptbar__row-desc">{row.desc}</span>
              </button>
            ))}
            {rows.length === 0 && (
              <div className="promptbar__nomatch">No matches for “{query}”</div>
            )}
            <div className="promptbar__menu-foot">
              {menu === "at" ? "Type to search campaign context" : "Type to search commands"}
            </div>
          </div>
        )}

        {/* ── picker menu ─────────────────────────────────── */}
        {modelOpen && options && (
          <div
            onMouseLeave={() => setModelHovered(null)}
            className="promptbar__menu promptbar__menu--model"
            style={{ left: modelMenuLeft, bottom: modelMenuBottom }}
          >
            <span
              aria-hidden
              className="promptbar__glide"
              style={{
                top: modelBox?.top ?? 0,
                height: modelBox?.height ?? 0,
                opacity: modelBox && modelHovered !== null ? 1 : 0,
              }}
            />
            {options.map((m, i) => (
              <button
                key={m.key}
                type="button"
                ref={(el) => {
                  modelRowRefs.current[i] = el;
                }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setModelHovered(i)}
                onClick={() => {
                  onOptionChange?.(m.key);
                  setModelOpen(false);
                  inputRef.current?.focus();
                }}
                className="promptbar__row promptbar__row--sm"
              >
                <span className="promptbar__row-name truncate" style={{ flex: 1 }}>
                  {m.name}
                </span>
                {m.tag && (
                  <span className="promptbar__row-desc" style={{ flex: "none" }}>
                    {m.tag}
                  </span>
                )}
                <span style={{ visibility: m.key === current?.key ? "visible" : "hidden" }}>
                  <IconCheck size={13} strokeWidth={2.5} />
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── composer ───────────────────────────────────── */}
        <div
          className={`promptbar__box ${radius}${tall ? " is-tall" : ""}${wide ? " is-wide" : ""}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) inputRef.current?.focus();
          }}
        >
          <span ref={measureRef} aria-hidden className="promptbar__measure">
            {draft}
          </span>
          <div ref={controlsRef} className={`promptbar__grid${wide ? " is-wide" : ""}`}>
            {(sources.length > 0 || commands.length > 0) && (
              <button
                type="button"
                aria-label="Add context"
                aria-expanded={plusOpen}
                onClick={() => {
                  setModelOpen(false);
                  setPlusOpen((c) => !c);
                  inputRef.current?.focus();
                }}
                className="promptbar__btn promptbar__plus"
                data-on={plusOpen}
              >
                <IconPlus size={16} />
              </button>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              disabled={disabled}
              autoFocus={autoFocus}
              onChange={(event) => {
                setDraft(event.target.value);
                setDismissed(false);
                setPlusOpen(false);
              }}
              onKeyDown={(event) => {
                if (menuOpen && rows.length > 0) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    setEngaged(true);
                    setActive(
                      (c) => (c + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length,
                    );
                    return;
                  }
                  if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
                    event.preventDefault();
                    pick(rows[active]);
                    return;
                  }
                }
                if (event.key === "Escape") {
                  setDismissed(true);
                  closeMenus();
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder={listening ? "Listening…" : placeholder}
              aria-label={label}
              className="promptbar__input"
            />
            {options && current ? (
              <button
                ref={modelRef}
                type="button"
                aria-expanded={modelOpen}
                aria-label={`Focus: ${current.name}`}
                onClick={() => {
                  setPlusOpen(false);
                  setModelOpen((c) => !c);
                }}
                className="promptbar__btn promptbar__model"
              >
                {current.name}
                <IconChevronDown size={11} strokeWidth={2.4} style={{ color: "var(--ink-3)" }} />
              </button>
            ) : (
              <span className="promptbar__model" aria-hidden />
            )}
            {canDictate ? (
              <button
                type="button"
                aria-label={listening ? "Stop dictation" : "Start dictation"}
                aria-pressed={listening}
                onClick={toggleDictation}
                className="promptbar__btn promptbar__mic"
                data-on={listening}
              >
                {listening ? (
                  <span className="promptbar__eq">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{ animation: `eq-bounce 900ms ease-in-out ${i * 150}ms infinite` }}
                      />
                    ))}
                  </span>
                ) : (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                  </svg>
                )}
              </button>
            ) : (
              <span className="promptbar__mic" aria-hidden />
            )}
            {busy && onStop ? (
              <button
                type="button"
                aria-label="Stop"
                onClick={onStop}
                className="promptbar__btn promptbar__send is-on"
              >
                <IconStop size={12} />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Send"
                disabled={!canSend}
                onClick={send}
                className={`promptbar__btn promptbar__send${canSend ? " is-on" : ""}`}
              >
                {busy ? <span className="spinner" /> : <IconArrowUp size={16} strokeWidth={2.4} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
