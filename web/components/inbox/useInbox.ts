"use client";

import { useEffect, useRef } from "react";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import { withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { InboxSummary } from "@/lib/inbox/inbox";

/**
 * Everything waiting on the founder (`GET /api/inbox`). Reloads whenever the
 * server-derived count in campaign progress changes, so Home, Inbox and the
 * sidebar stay in step without polling twice.
 */
export function useInbox() {
  const { sessionId, progress, refreshProgress } = useCampaign();
  const query = useApi<InboxSummary>(withQuery("/api/inbox", { session_id: sessionId }));
  const waiting = progress
    ? progress.sales.needsYou.total +
      progress.sales.drafts.pending +
      progress.marketing.opportunities.needsReview
    : null;

  const { reload } = query;
  const last = useRef(waiting);
  useEffect(() => {
    if (waiting === null || waiting === last.current) return;
    const first = last.current === null;
    last.current = waiting;
    if (!first) reload();
  }, [waiting, reload]);

  return {
    ...query,
    /** refetch the inbox and the campaign progress after an action */
    refresh: () => {
      reload();
      refreshProgress();
    },
  };
}
