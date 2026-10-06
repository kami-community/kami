"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import GetStarted from "@/components/home/GetStarted";
import NextStepCard from "@/components/home/NextStepCard";
import Results from "@/components/home/Results";
import TeamActivity from "@/components/home/TeamActivity";
import WaitingOnYou from "@/components/home/WaitingOnYou";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { Page, PageHeader } from "@/components/ui/Page";
import Skeleton from "@/components/ui/Skeleton";
import { chooseWasSkipped } from "@/lib/client/chooseSkip";
import {
  distributionStarted,
  getStartedChecklist,
  nextStep,
  salesStarted,
} from "@/lib/client/nextStep";

/**
 * Home — "What should I do next to grow?": the next step, what is waiting on
 * the founder, the get-started checklist, results and the team's recent work.
 * Everything is derived from server state (campaign progress, inbox, runs).
 */
export default function HomeArea() {
  const router = useRouter();
  const { session, sessionId, dossier, progress, progressError, refreshProgress } = useCampaign();
  const goals = session.goals ?? [];
  const company =
    dossier?.company || session.domain_check?.company_name || session.canonical_domain;
  const checklist = progress ? getStartedChecklist(progress, goals) : null;
  // No job started, and this tab didn't skip Choose: send them back to that step.
  const returnToChoose =
    !!progress &&
    !salesStarted(progress) &&
    !distributionStarted(progress) &&
    !chooseWasSkipped(sessionId);

  useEffect(() => {
    if (returnToChoose) router.replace(`/start/${sessionId}`);
  }, [returnToChoose, router, sessionId]);

  if (returnToChoose) {
    return (
      <Page>
        <Skeleton title lines={4} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow={session.canonical_domain}
        title={company}
        lede="Kami researches and drafts. You approve every send and post. Here is what to do next to grow."
      />

      <div className="home">
        {progressError && !progress && (
          <Callout
            tone="error"
            actions={
              <Button size="sm" variant="secondary" onClick={refreshProgress}>
                Try again
              </Button>
            }
          >
            {progressError}
          </Callout>
        )}
        {progress ? (
          <NextStepCard step={nextStep(progress, goals)} paused={progress.paused} />
        ) : (
          !progressError && (
            <div className="card home-next">
              <Skeleton title lines={2} />
            </div>
          )
        )}

        <WaitingOnYou />
        {checklist && <GetStarted items={checklist} />}
        {progress && <Results progress={progress} />}
        <TeamActivity sessionId={sessionId} />
      </div>
    </Page>
  );
}
