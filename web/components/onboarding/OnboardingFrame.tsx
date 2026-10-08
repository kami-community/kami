"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/Button";
import { IconArrowLeft, IconCheck } from "@/components/ui/icons";
import ThemeToggle from "@/components/ui/ThemeToggle";
import type { CampaignSummary } from "@/lib/campaigns/sessions";
import { useApi } from "@/lib/client/useApi";

export type OnboardingStep = 1 | 2 | 3;

const STEPS: { step: OnboardingStep; label: string }[] = [
  { step: 1, label: "Company" },
  { step: 2, label: "Confirm" },
  { step: 3, label: "Choose" },
];

/**
 * The full-screen onboarding frame: a minimal top bar (seal, step indicator,
 * a way back to another campaign, theme) over one centred column. No
 * workspace sidebar until the founder is in.
 */
export default function OnboardingFrame({
  step,
  campaignId,
  children,
}: {
  step: OnboardingStep;
  /** The campaign being onboarded, excluded from the "back to" link. */
  campaignId?: string;
  children: ReactNode;
}) {
  return (
    <div className="onb">
      <header className="onb__bar">
        <span className="onb__brand">
          <span className="kami-seal" aria-hidden>
            K
          </span>
          <span className="onb__wordmark">Kami</span>
        </span>

        <nav aria-label="Onboarding progress" className="onb__steps-nav">
          <ol className="onb__steps">
            {STEPS.map((s) => {
              const state = s.step < step ? "done" : s.step === step ? "current" : "todo";
              return (
                <li
                  key={s.step}
                  className="onb__step"
                  data-state={state}
                  aria-current={state === "current" ? "step" : undefined}
                >
                  <span className="onb__step-mark" aria-hidden>
                    {state === "done" ? <IconCheck size={10} strokeWidth={3} /> : s.step}
                  </span>
                  <span className="onb__step-label">{s.label}</span>
                  {state === "done" && <span className="sr-only"> (done)</span>}
                </li>
              );
            })}
          </ol>
        </nav>

        <span className="onb__bar-end">
          <BackToCampaign exclude={campaignId} />
          <ThemeToggle />
        </span>
      </header>

      <main className="onb__main">{children}</main>
    </div>
  );
}

/** A quiet link back to the newest other campaign, when there is one. */
function BackToCampaign({ exclude }: { exclude?: string }) {
  const { data } = useApi<{ campaigns: CampaignSummary[] }>("/api/sessions");
  // Advisory only: without the list the founder can still finish onboarding.
  const other = data?.campaigns.find((c) => c.id !== exclude);
  if (!other) return null;
  const name = other.company_name ?? other.canonical_domain;
  const href = other.dossier_confirmed_at ? `/c/${other.id}` : `/start/${other.id}`;
  return (
    <Link href={href} className={buttonClass("quiet", "sm", "onb__back")} title={`Back to ${name}`}>
      <IconArrowLeft size={13} />
      <span className="onb__back-label">Back to {name}</span>
    </Link>
  );
}
