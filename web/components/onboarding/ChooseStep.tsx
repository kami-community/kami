"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import Button, { buttonClass } from "@/components/ui/Button";
import { IconArrowRight, IconCheck, IconMegaphone, IconTarget } from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/Pills";
import type { CampaignProgress } from "@/lib/campaigns/progress";
import { markChooseSkipped } from "@/lib/client/chooseSkip";
import { jobHref, recommendedJob, type Job } from "./constants";

interface JobOption {
  job: Job;
  title: string;
  icon: ReactNode;
  body: string;
  steps: string[];
  start: string;
  resume: string;
}

const JOBS: JobOption[] = [
  {
    job: "sales",
    title: "Find customers",
    icon: <IconTarget size={18} />,
    body: "Reach companies that look like your best buyers, one small batch at a time.",
    steps: [
      "Agree who to reach first",
      "Find and check matching companies",
      "Draft emails you approve one by one",
    ],
    start: "Start finding customers",
    resume: "Continue finding customers",
  },
  {
    job: "distribution",
    title: "Create distribution",
    icon: <IconMegaphone size={18} />,
    body: "Show up in the conversations your buyers already have.",
    steps: [
      "Agree where to show up",
      "Spot today’s best openings",
      "Draft posts you approve before they go out",
    ],
    start: "Start creating distribution",
    resume: "Continue creating distribution",
  },
];

/** The job a founder already started, worked out from server-side progress. */
function startedJob(progress: CampaignProgress | null): Job | null {
  if (!progress) return null;
  const sales = progress.sales;
  if (sales.configured || sales.segmentsConfirmed || sales.planStatus !== "none") return "sales";
  if (progress.marketing.planStatus !== "none") return "distribution";
  return null;
}

function reason(job: Job, goals: readonly string[]): string {
  const goal = goals.find((g) =>
    job === "distribution" ? g === "Get signups" || g === "Build awareness" : g === "Book meetings",
  );
  if (goal) return `You want to ${goal.toLowerCase()}.`;
  return job === "sales"
    ? "Direct conversations with likely buyers are the fastest way to learn."
    : "Being visible where buyers talk brings people to you.";
}

/**
 * Onboarding step 3: choose the first job. Kami's recommendation follows the
 * founder's goals; either way the other job stays one click away.
 */
export default function ChooseStep() {
  const router = useRouter();
  const { session, sessionId, dossier, progress } = useCampaign();
  const goals = session.goals ?? [];
  const recommended = recommendedJob(goals);
  const started = startedJob(progress);
  const [picked, setPicked] = useState<Job | null>(null);
  const [opening, setOpening] = useState(false);
  const selected = picked ?? started ?? recommended;
  const option = JOBS.find((j) => j.job === selected) ?? JOBS[0];
  const company = dossier?.company ?? session.canonical_domain;

  function open() {
    setOpening(true);
    router.push(jobHref(sessionId, selected));
  }

  return (
    <section className="onb__panel onb__panel--wide" aria-labelledby="onb-choose-title">
      <div className="onb__intro">
        <span className="onb__confirmed">
          <IconCheck size={12} strokeWidth={3} /> {company} confirmed
        </span>
        <h1 id="onb-choose-title" className="onb__title onb__title--sm">
          What should Kami do first?
        </h1>
        <p className="onb__lede">Pick one to start. You can add the other any time.</p>
      </div>

      <div className="onb-jobs" role="radiogroup" aria-labelledby="onb-choose-title">
        {JOBS.map((j) => {
          const isRecommended = j.job === recommended;
          return (
            <label key={j.job} className="onb-job" data-selected={j.job === selected}>
              <input
                type="radio"
                name="first-job"
                className="sr-only"
                value={j.job}
                checked={j.job === selected}
                onChange={() => setPicked(j.job)}
              />
              <span className="onb-job__top">
                <span className="onb-job__icon">{j.icon}</span>
                {j.job === started ? (
                  <StatusPill tone="green">Started</StatusPill>
                ) : (
                  isRecommended && <StatusPill tone="accent">Recommended</StatusPill>
                )}
                <span className="onb-job__radio" aria-hidden />
              </span>
              <span className="onb-job__title">{j.title}</span>
              <span className="onb-job__body">{j.body}</span>
              <ul className="onb-job__steps">
                {j.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              {isRecommended && <span className="onb-job__reason">{reason(j.job, goals)}</span>}
            </label>
          );
        })}
      </div>

      <div className="onb__actions">
        <Button
          variant="accent"
          size="lg"
          busy={opening}
          icon={<IconArrowRight size={15} />}
          onClick={open}
        >
          {started === selected ? option.resume : option.start}
        </Button>
        <Link
          href={`/c/${sessionId}`}
          className={buttonClass("quiet", "sm")}
          onClick={() => markChooseSkipped(sessionId)}
        >
          Skip to workspace
        </Link>
      </div>
    </section>
  );
}
