"use client";

import { useState } from "react";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { DistributionCampaignConfig } from "@/lib/distributionTypes";

/**
 * The campaign's distribution plan: loaded once, replaced by the latest
 * mutation result, plus the Distribution pause (PATCH on the same route).
 */
export function useDistributionPlan() {
  const campaign = useCampaign();
  const { sessionId } = campaign;
  const loaded = useApi<{ config: DistributionCampaignConfig | null }>(
    withQuery("/api/marketing/distribution/setup", { session_id: sessionId }),
  );
  const [local, setLocal] = useState<DistributionCampaignConfig | null>(null);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);

  // The latest mutation result wins over the (possibly stale) loaded config.
  const config = local ?? loaded.data?.config ?? null;
  const approved = config?.status === "approved";
  const paused = Boolean(config?.autonomous_paused);

  function update(next: DistributionCampaignConfig) {
    setLocal(next);
    campaign.refreshProgress();
  }

  async function togglePause() {
    setPauseBusy(true);
    setPauseError(null);
    try {
      const res = await api.patch<{ config: DistributionCampaignConfig }>(
        "/api/marketing/distribution/setup",
        {
          session_id: sessionId,
          autonomous_paused: !paused,
        },
      );
      update(res.config);
    } catch (err) {
      setPauseError(errorMessage(err, "Could not change the distribution pause"));
    } finally {
      setPauseBusy(false);
    }
  }

  return {
    config,
    approved,
    paused,
    loading: loaded.loading && !config,
    error: config ? null : loaded.error,
    reload: loaded.reload,
    update,
    togglePause,
    pauseBusy,
    pauseError,
  };
}
