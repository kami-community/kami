"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import Button from "@/components/ui/Button";
import GlideMenu from "@/components/bui/GlideMenu";
import { IconCheck, IconChevronDown, IconChevronUp, IconClose } from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * APPROVAL CARD (human-in-the-loop)
 * One question at a time. The stack slides vertically as you
 * move between questions (the card's height animates to fit),
 * the step counter rolls like an odometer, and the footer uses
 * pill actions — a quiet Skip and a Continue.
 * Single-choice answers auto-advance; multi-select waits.
 * ───────────────────────────────────────────────────────── */

export type ApprovalQuestion = {
  q: string;
  type: "radio" | "check";
  options: string[];
  /** allow a free-text answer ("Something else…") */
  custom?: boolean;
};

/** answers per question: picked option indexes, plus any custom text */
export type ApprovalAnswers = Record<number, { picked: number[]; custom: string }>;

export type ApprovalLabels = {
  skip: string;
  continue: string;
  send: string;
  customPlaceholder: string;
  sentMessage: string;
};

const DEFAULT_LABELS: ApprovalLabels = {
  skip: "Skip",
  continue: "Continue",
  send: "Send",
  customPlaceholder: "Something else…",
  sentMessage: "Answers sent",
};

const ROLL_MS = 400;
const SLIDE = "360ms cubic-bezier(0.22, 1, 0.36, 1)";

/* odometer digits — each character that changes rolls up (or down) */
function RollingDigits({ value }: { value: string }) {
  const prevRef = useRef(value);
  const [oldVal, setOldVal] = useState(value);
  const [newVal, setNewVal] = useState(value);
  const [rolling, setRolling] = useState(false);
  const [shifted, setShifted] = useState(false);
  const [dir, setDir] = useState<"up" | "down">("up");

  useEffect(() => {
    if (prevRef.current === value) return;
    const from = prevRef.current;
    prevRef.current = value;
    const fromN = parseInt(from, 10);
    const toN = parseInt(value, 10);
    setDir(Number.isFinite(fromN) && Number.isFinite(toN) && toN < fromN ? "down" : "up");
    setOldVal(from);
    setNewVal(value);
    setRolling(true);
    setShifted(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShifted(true));
    });
    const done = setTimeout(() => {
      setRolling(false);
      setOldVal(value);
      setShifted(false);
    }, ROLL_MS);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(done);
    };
  }, [value]);

  const chars = rolling ? newVal : oldVal;
  return (
    <>
      {Array.from({ length: chars.length }, (_, i) => {
        const o = oldVal[i] ?? "";
        const n = chars[i] ?? "";
        if (!rolling || o === n) return <span key={`${i}-${n}`}>{n}</span>;
        const top = dir === "down" ? n : o;
        const bottom = dir === "down" ? o : n;
        const restY = dir === "down" ? "0" : "-1em";
        const startY = dir === "down" ? "-1em" : "0";
        return (
          <span key={`${i}-${o}-${n}-${dir}`} className="odometer">
            <span
              className="odometer__track"
              style={{ transform: `translateY(${shifted ? restY : startY})` }}
            >
              <span className="odometer__digit">{top}</span>
              <span className="odometer__digit">{bottom}</span>
            </span>
          </span>
        );
      })}
    </>
  );
}

export default function ApprovalCard({
  questions,
  labels,
  initial,
  onSubmitted,
  onAnswerChange,
  onDismiss,
  resettable = true,
  dismissible = false,
  busy = false,
}: {
  questions: ApprovalQuestion[];
  labels?: Partial<ApprovalLabels>;
  initial?: ApprovalAnswers;
  onSubmitted?: (answers: ApprovalAnswers) => void;
  onAnswerChange?: (questionIndex: number, answer: { picked: number[]; custom: string }) => void;
  onDismiss?: () => void;
  resettable?: boolean;
  dismissible?: boolean;
  busy?: boolean;
}) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number[]>>(() =>
    Object.fromEntries(Object.entries(initial ?? {}).map(([k, v]) => [k, v.picked])),
  );
  const [custom, setCustom] = useState<Record<number, string>>(() =>
    Object.fromEntries(Object.entries(initial ?? {}).map(([k, v]) => [k, v.custom])),
  );
  const [sent, setSent] = useState(false);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const measured = useRef(false);
  const [viewportH, setViewportH] = useState<number | undefined>(undefined);
  const [trackY, setTrackY] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [ready, setReady] = useState(false);

  const last = qi === questions.length - 1;
  const selected = answers[qi] ?? [];
  const hasAnswer = selected.length > 0 || Boolean(custom[qi]?.trim());

  const collect = (
    a: Record<number, number[]> = answers,
    c: Record<number, string> = custom,
  ): ApprovalAnswers =>
    Object.fromEntries(
      questions.map((_, i) => [i, { picked: a[i] ?? [], custom: (c[i] ?? "").trim() }]),
    );

  const sync = (withAnim: boolean) => {
    const item = questionRefs.current[qi];
    if (!item) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setViewportH(item.offsetHeight);
    setTrackY(item.offsetTop);
    setAnimate(withAnim && !reduce);
  };

  // Measuring the DOM is what this layout effect is for: the card's height and
  // track offset come from the rendered question, before paint.
  useLayoutEffect(() => {
    const withAnim = measured.current;
    measured.current = true;
    sync(withAnim);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first measure unlocks the full stack
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi, answers, custom, sent]);

  useEffect(() => {
    const id = requestAnimationFrame(() => sync(measured.current));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi]);

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  const goTo = (next: number) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setQi(Math.min(Math.max(next, 0), questions.length - 1));
  };

  const send = (a = answers, c = custom) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setSent(true);
    onSubmitted?.(collect(a, c));
  };

  const advance = () => {
    if (last) send();
    else goTo(qi + 1);
  };

  const toggle = (index: number) => {
    const type = questions[qi].type;
    const picked = answers[qi] ?? [];
    const next =
      type === "radio"
        ? [index]
        : picked.includes(index)
          ? picked.filter((item) => item !== index)
          : [...picked, index];
    const nextAnswers = { ...answers, [qi]: next };
    const nextCustom = type === "radio" ? { ...custom, [qi]: "" } : custom;
    setAnswers(nextAnswers);
    setCustom(nextCustom);
    onAnswerChange?.(qi, { picked: next, custom: nextCustom[qi] ?? "" });
    if (type === "radio") {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => {
        if (last) send(nextAnswers, nextCustom);
        else setQi((current) => Math.min(questions.length - 1, current + 1));
      }, 480);
    }
  };

  const reset = () => {
    setQi(0);
    setAnswers({});
    setCustom({});
    setSent(false);
    measured.current = false;
  };

  if (sent) {
    return (
      <div className="approval-sent">
        <span className="applied-pill">
          <span className="applied-pill__dot">
            {busy ? <span className="btn__spinner" /> : <IconCheck size={11} strokeWidth={3} />}
          </span>
          {t.sentMessage}
        </span>
        {resettable && !busy && (
          <button type="button" onClick={reset} className="approval-sent__reset">
            Change answers
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="approval">
      <div className="approval__card card">
        {dismissible && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismiss}
            className="primitive-icon-button approval__dismiss"
          >
            <IconClose size={14} strokeWidth={2.2} />
          </button>
        )}
        <div className="primitive-card-pad">
          <div
            className="approval__viewport"
            style={{ height: viewportH, transition: animate ? `height ${SLIDE}` : undefined }}
            aria-live="polite"
          >
            <div
              className="approval__track"
              style={{
                transform: `translate3d(0, ${-trackY}px, 0)`,
                transition: animate ? `transform ${SLIDE}` : undefined,
              }}
            >
              {questions.map((question, qIdx) => {
                const active = qIdx === qi;
                if (!ready && !active) return null;
                const picked = answers[qIdx] ?? [];
                const questionStyle: CSSProperties = {
                  opacity: active ? 1 : 0,
                  transition: animate ? `opacity ${SLIDE}` : undefined,
                  pointerEvents: active ? undefined : "none",
                };
                return (
                  <div
                    key={qIdx}
                    ref={(el) => {
                      questionRefs.current[qIdx] = el;
                    }}
                    aria-hidden={active ? undefined : true}
                    style={questionStyle}
                  >
                    <div className="approval__q" id={`approval-q-${qIdx}`}>
                      {question.q}
                    </div>
                    <GlideMenu
                      className="approval__options"
                      highlightClassName="glide__highlight--control"
                    >
                      <div
                        role={question.type === "radio" ? "radiogroup" : "group"}
                        aria-labelledby={`approval-q-${qIdx}`}
                        className="approval__options-inner"
                      >
                        {question.options.map((option, i) => {
                          const on = picked.includes(i);
                          return (
                            <button
                              key={option}
                              type="button"
                              data-menu-row
                              role={question.type === "radio" ? "radio" : "checkbox"}
                              aria-checked={on}
                              tabIndex={active ? 0 : -1}
                              onClick={() => {
                                if (active) toggle(i);
                              }}
                              className="approval__option"
                            >
                              <span
                                className={`approval__mark approval__mark--${question.type}${on ? " is-on" : ""}`}
                              >
                                {question.type === "radio" ? (
                                  <span
                                    className="approval__dot"
                                    style={{ transform: on ? "scale(1)" : "scale(0)" }}
                                  />
                                ) : (
                                  <IconCheck size={12} strokeWidth={3} />
                                )}
                              </span>
                              <span className={`approval__label${on ? " is-on" : ""}`}>
                                {option}
                              </span>
                            </button>
                          );
                        })}
                        {question.custom !== false && (
                          <label data-menu-row className="approval__option approval__option--input">
                            <input
                              value={custom[qIdx] ?? ""}
                              tabIndex={active ? 0 : -1}
                              onChange={(event) => {
                                if (!active) return;
                                const nextCustom = { ...custom, [qIdx]: event.target.value };
                                setCustom(nextCustom);
                                if (question.type === "radio")
                                  setAnswers((c) => ({ ...c, [qIdx]: [] }));
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && hasAnswer) {
                                  event.preventDefault();
                                  advance();
                                }
                              }}
                              placeholder={t.customPlaceholder}
                              aria-label="Custom answer"
                              className="approval__custom"
                            />
                          </label>
                        )}
                      </div>
                    </GlideMenu>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="primitive-card-footer approval__footer">
          <div className="approval__nav">
            <button
              type="button"
              aria-label="Previous question"
              disabled={qi <= 0}
              onClick={() => goTo(qi - 1)}
              className="approval__step-btn"
            >
              <IconChevronUp size={14} />
            </button>
            <span className="approval__counter">
              <RollingDigits value={`${qi + 1} / ${questions.length}`} />
            </span>
            <button
              type="button"
              aria-label="Next question"
              disabled={last}
              onClick={() => goTo(qi + 1)}
              className="approval__step-btn"
            >
              <IconChevronDown size={14} />
            </button>
          </div>
          <div className="row" style={{ gap: 6, marginRight: -2 }}>
            <Button variant="ghost" size="sm" onClick={() => (last ? send() : goTo(qi + 1))}>
              {t.skip}
            </Button>
            <Button variant="accent" size="sm" disabled={!hasAnswer} onClick={advance}>
              {last ? t.send : t.continue}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
