"use client";

import LoadingState from "@/components/bui/LoadingState";
import ThinkingState from "@/components/bui/ThinkingState";
import { useStagedProgress } from "@/components/bui/useStagedProgress";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import DossierConfirm from "@/components/DossierConfirm";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { IconRetry } from "@/components/ui/icons";

/**
 * Onboarding step 2: the brand analyst drafts the company summary (the
 * dossier) from the researched site; the founder checks it and confirms
 * ("That's us"), edits it, or corrects it with a note.
 */
export default function ConfirmStep() {
  const campaign = useCampaign();
  const { session, dossier, dossierJob } = campaign;
  const domain = session.canonical_domain;
  const sources = session.research_snapshot?.sources ?? [];
  const building = !dossier && !dossierJob.error;

  const staged = useStagedProgress(
    [
      `Checked ${domain}`,
      `Read ${sources.length} ${sources.length === 1 ? "page" : "pages"} about you`,
      "Working out what you sell and who it’s for",
      "Checking every claim against your site",
      "Listing your first customers and alternatives",
    ],
    building,
    { stepMs: 2600, failed: Boolean(dossierJob.error) },
  );

  if (dossier) {
    return (
      <section className="onb__panel onb__panel--wide" aria-labelledby="onb-confirm-title">
        <div className="onb__intro">
          <h1 id="onb-confirm-title" className="onb__title">
            Is this {dossier.company}?
          </h1>
          <p className="onb__lede">
            Here’s what Kami learned from {domain}. Check it before Kami plans anything.
          </p>
        </div>
        <DossierConfirm
          variant="onboarding"
          dossier={dossier}
          sessionDbId={campaign.sessionId}
          onConfirm={campaign.confirmDossier}
          onDossierUpdated={campaign.setDossier}
        />
      </section>
    );
  }

  return (
    <section className="onb__panel" aria-labelledby="onb-confirm-title">
      <div className="onb__intro">
        <h1 id="onb-confirm-title" className="onb__title">
          Getting to know {domain}
        </h1>
        <p className="onb__lede">
          This usually takes under a minute. You’ll check the result next.
        </p>
      </div>

      {building ? (
        <div className="onb__progress" aria-live="polite">
          <LoadingState
            label="Brand analyst is reading your site"
            startedAt={staged.startedAt ?? undefined}
          />
          <ThinkingState
            working
            rows={staged.rows}
            active="Writing your company summary"
            done="Done"
          />
        </div>
      ) : (
        <Callout
          tone="error"
          title="Kami couldn’t write your company summary"
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon={<IconRetry size={13} />}
              onClick={() => void campaign.generateDossier()}
            >
              Try again
            </Button>
          }
        >
          {dossierJob.error}
        </Callout>
      )}
    </section>
  );
}
