"use client";

import { IconCheck, IconLock } from "@/components/ui/icons";
import type { SalesTab } from "@/lib/client/routes";
import type { SalesStep } from "./salesSteps";

/**
 * The Find-customers setup loop as a horizontal stepper. Done and open steps
 * are buttons that open their tab; locked steps say why.
 */
export default function SalesStepper({
  steps,
  onSelect,
}: {
  steps: SalesStep[];
  onSelect: (tab: SalesTab) => void;
}) {
  return (
    <nav className="sales-stepper" aria-label="Setup steps">
      <ol className="sales-stepper__list">
        {steps.map((step) => {
          const locked = step.state === "locked";
          return (
            <li key={step.key} className={`sales-stepper__step is-${step.state}`}>
              <button
                type="button"
                className="sales-stepper__btn"
                aria-current={step.state === "current" ? "step" : undefined}
                aria-disabled={locked || undefined}
                aria-describedby={locked ? `sales-step-${step.key}-hint` : undefined}
                onClick={() => {
                  if (!locked) onSelect(step.tab);
                }}
              >
                <span className="sales-stepper__mark" aria-hidden>
                  {step.state === "done" ? (
                    <IconCheck size={12} strokeWidth={2.6} />
                  ) : locked ? (
                    <IconLock size={11} strokeWidth={2.4} />
                  ) : (
                    step.num
                  )}
                </span>
                <span className="sales-stepper__text">
                  <span className="sales-stepper__label">{step.label}</span>
                  <span
                    className="sales-stepper__sub"
                    id={locked ? `sales-step-${step.key}-hint` : undefined}
                  >
                    {locked
                      ? step.hint
                      : step.state === "done"
                        ? "Done"
                        : step.state === "current"
                          ? "Up next"
                          : "Open"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** After the first send: the setup loop as one line of progress. */
export function SalesProgressLine({
  companies,
  sent,
  toReview,
  onOpenEmails,
}: {
  companies: number;
  sent: number;
  toReview: number;
  onOpenEmails: () => void;
}) {
  return (
    <p className="sales-progress" aria-label="Find customers progress">
      <span className="sales-progress__done">
        <IconCheck size={12} strokeWidth={2.6} aria-hidden /> Set up
      </span>
      <span className="sales-progress__sep" aria-hidden>
        ·
      </span>
      <span className="tabular">
        {companies} compan{companies === 1 ? "y" : "ies"}
      </span>
      <span className="sales-progress__sep" aria-hidden>
        ·
      </span>
      <span className="tabular">
        {sent} email{sent === 1 ? "" : "s"} sent
      </span>
      {toReview > 0 && (
        <>
          <span className="sales-progress__sep" aria-hidden>
            ·
          </span>
          <button type="button" className="sales-progress__link" onClick={onOpenEmails}>
            {toReview} to review
          </button>
        </>
      )}
    </p>
  );
}
