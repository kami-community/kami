"use client";

import { useState } from "react";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import SalesPlanView from "@/components/SalesPlanView";
import SegmentConfirm from "@/components/SegmentConfirm";
import { Section } from "@/components/ui/Page";
import type { SalesSegment } from "@/lib/domain/segments";
import type { SalesCampaignConfig } from "@/lib/salesTypes";
import type { SalesPlanState } from "./useSalesPlan";
import WhoSummary from "./WhoSummary";

/**
 * Plan tab: who you sell to comes first, then the plan to approve. Once who
 * is confirmed it folds into a summary with an Edit that reopens it.
 */
export default function PlanTab({
  config,
  segmentsConfirmed,
  plan,
  onPlanApproved,
  onEditSettings,
}: {
  config: SalesCampaignConfig;
  segmentsConfirmed: boolean;
  plan: SalesPlanState;
  onPlanApproved: () => void;
  onEditSettings: () => void;
}) {
  const campaign = useCampaign();
  const [editing, setEditing] = useState(false);
  const segments = (config.segments as SalesSegment[] | null | undefined) ?? null;

  function handleConfirmed(next: SalesSegment[]) {
    campaign.setSalesConfig({
      ...config,
      segments: next,
      segments_confirmed_at: new Date().toISOString(),
    });
    campaign.refreshProgress();
    setEditing(false);
    // new buyers mean a new plan: the strategist writes one for approval
    void plan.generate();
  }

  if (!segmentsConfirmed || editing) {
    return (
      <Section
        title="Who you sell to"
        desc={
          editing
            ? "Saving changes writes a new plan for you to approve."
            : "Kami drafted this from your company profile. Fix anything that looks wrong."
        }
      >
        <SegmentConfirm
          sessionDbId={campaign.sessionId}
          onConfirmed={handleConfirmed}
          onCancel={editing ? () => setEditing(false) : undefined}
        />
      </Section>
    );
  }

  return (
    <div className="stack stack--lg">
      <WhoSummary
        segments={config.segments ?? []}
        onEdit={() => setEditing(true)}
        onEditSettings={onEditSettings}
      />
      <Section title="Your plan" desc="Nothing is researched or sent until you approve.">
        <SalesPlanView
          sessionDbId={campaign.sessionId}
          plan={plan.plan}
          loading={plan.loading}
          generating={plan.generating}
          error={plan.error}
          offer={config.offer}
          segments={segments}
          planSource={plan.source}
          planNote={plan.note}
          onApproved={(p) => {
            plan.replace(p);
            campaign.refreshProgress();
            onPlanApproved();
          }}
          onRevised={(p, meta) => plan.replace(p, meta)}
          onGenerate={() => void plan.generate()}
          onRetry={plan.retry}
        />
      </Section>
    </div>
  );
}
