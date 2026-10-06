"use client";

import { useState, type ReactNode } from "react";
import Button, { type ButtonVariant } from "@/components/ui/Button";

/* ─────────────────────────────────────────────────────────
 * RECOMMENDATION CARD
 * The card holds its shape. Pressing "Alternatives" opens a
 * drawer listing the other options; picking one promotes it
 * to the recommendation. The primary action confirms.
 * ───────────────────────────────────────────────────────── */

export type Confidence = { signal: 0 | 1 | 2 | 3; label: string; tone?: string };

export type RecommendationOption = {
  key: string;
  body: ReactNode;
  short: string;
  confidence: Confidence;
  cta: string;
  ctaVariant?: ButtonVariant;
  onAccept: () => void | Promise<void>;
};

export function confidenceTone(signal: number): string {
  return signal >= 3
    ? "var(--green)"
    : signal === 2
      ? "var(--orange)"
      : signal === 1
        ? "var(--red)"
        : "var(--ink-3)";
}

export function Meter({ signal, tone }: { signal: number; tone?: string }) {
  const color = tone ?? confidenceTone(signal);
  return (
    <span className="meter" aria-hidden>
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="meter__bar"
          style={{ background: bar < signal ? color : "var(--line-strong)" }}
        />
      ))}
    </span>
  );
}

export default function RecommendationCard({
  title,
  options,
  labels,
  secondary,
  footer,
  className,
}: {
  title: ReactNode;
  options: RecommendationOption[];
  labels?: Partial<{ alternatives: string; otherOptions: string; accepted: string }>;
  /** an extra quiet action left of the CTA (e.g. "Edit") */
  secondary?: ReactNode;
  /** content between body and footer (e.g. a revise field) */
  footer?: ReactNode;
  className?: string;
}) {
  const t = {
    alternatives: "Alternatives",
    otherOptions: "Other options",
    accepted: "Accepted",
    ...labels,
  };
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "accepted">("idle");
  const [error, setError] = useState<string | null>(null);

  const active = options[Math.min(selected, options.length - 1)];
  const others = options.map((o, i) => ({ o, i })).filter(({ i }) => i !== selected);
  if (!active) return null;

  async function accept() {
    setState("busy");
    setError(null);
    try {
      await active.onAccept();
      setState("accepted");
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className={`reco card${className ? ` ${className}` : ""}`}>
      <div className="primitive-card-pad">
        <span className="reco__title">{title}</span>
        <div key={active.key} className="reco__body">
          {active.body}
        </div>
        {error && (
          <p className="field__error" role="alert" style={{ marginTop: 6 }}>
            {error}
          </p>
        )}
      </div>

      {footer}

      {others.length > 0 && (
        <div className="collapse" data-open={open}>
          <div className="collapse__inner">
            <div className="reco__drawer">
              <p className="reco__drawer-label">{t.otherOptions}</p>
              {others.map(({ o, i }) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    setSelected(i);
                    setState("idle");
                    setOpen(false);
                  }}
                  className="reco__option"
                >
                  <Meter signal={o.confidence.signal} tone={o.confidence.tone} />
                  <span className="reco__option-text truncate">{o.short}</span>
                  <span className="reco__option-label">{o.confidence.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="primitive-card-footer reco__footer">
        <span className="row">
          <Meter signal={active.confidence.signal} tone={active.confidence.tone} />
          <span className="reco__confidence">{active.confidence.label}</span>
        </span>
        <span className="row" style={{ gap: 8, marginRight: -2 }}>
          {secondary}
          {others.length > 0 && (
            <Button size="sm" aria-expanded={open} onClick={() => setOpen((c) => !c)}>
              {t.alternatives}
            </Button>
          )}
          <Button
            variant={state === "accepted" ? "success" : (active.ctaVariant ?? "accent")}
            size="sm"
            busy={state === "busy"}
            disabled={state === "accepted"}
            onClick={() => void accept()}
          >
            {state === "accepted" ? t.accepted : active.cta}
          </Button>
        </span>
      </div>
    </div>
  );
}
