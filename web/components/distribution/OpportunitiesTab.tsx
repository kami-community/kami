"use client";

import { useState } from "react";
import { specialistsFor } from "@/components/distribution/agents";
import { PLATFORM_LABELS } from "@/components/marketing/platforms";
import OpportunityQueue from "@/components/OpportunityQueue";
import ViewLink from "@/components/settings/ViewLink";
import Callout from "@/components/ui/Callout";
import { ValuePill } from "@/components/ui/Pills";
import Skeleton from "@/components/ui/Skeleton";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { DistributionCampaignConfig, DistributionOpportunity } from "@/lib/distributionTypes";

interface ResearchResult {
  opportunities: DistributionOpportunity[];
  source: string | null;
  note: string | null;
}

/**
 * Today's distribution opportunities on the approved surfaces. "Find
 * opportunities" asks the Distribution manager, who briefs one specialist
 * per surface; the founder reviews, posts and logs what happened.
 */
export default function OpportunitiesTab({
  sessionId,
  config,
  paused,
  onChanged,
}: {
  sessionId: string;
  config: DistributionCampaignConfig;
  paused: boolean;
  onChanged: () => void;
}) {
  const opps = useApi<{ opportunities: DistributionOpportunity[] }>(
    withQuery("/api/marketing/distribution/opportunities", { session_id: sessionId }),
  );
  const [research, setResearch] = useState<{ source: string | null; note: string | null }>({
    source: null,
    note: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const surfaces = config.surfaces ?? [];

  async function runResearch() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<ResearchResult>("/api/marketing/distribution/opportunities", {
        session_id: sessionId,
        action: "research",
      });
      setResearch({ source: res.source, note: res.note });
      opps.reload();
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "Research failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p className="dist-brief">
        <span className="text-3">Researching for</span>
        <span className="dist-brief__job">
          {config.goal_label || config.goal.replace(/_/g, " ")}
        </span>
        <span className="text-3">on</span>
        {surfaces.map((s) => (
          <ValuePill key={s}>{PLATFORM_LABELS[s]}</ValuePill>
        ))}
        <ViewLink to={{ area: "distribution", tab: "plan" }}>Change plan</ViewLink>
      </p>

      {error && (
        <Callout tone="error" title="Research failed">
          {error}
        </Callout>
      )}
      {opps.error && (
        <Callout tone="error" title="Could not load opportunities">
          {opps.error}
        </Callout>
      )}

      {opps.loading && !opps.data ? (
        <Skeleton title lines={6} />
      ) : (
        <OpportunityQueue
          opportunities={opps.data?.opportunities ?? []}
          sessionDbId={sessionId}
          surfaces={surfaces}
          researchNote={research.note}
          researchSource={research.source}
          busy={busy}
          paused={paused}
          busyLabel={`Distribution manager is briefing ${specialistsFor(surfaces)}…`}
          connectX={<ViewLink to={{ area: "settings", tab: "connections" }}>Connect X</ViewLink>}
          onRefresh={() => {
            opps.reload();
            onChanged();
          }}
          onResearch={() => void runResearch()}
        />
      )}
    </div>
  );
}
