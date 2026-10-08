"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { rememberedCampaign } from "@/lib/client/lastCampaign";

/**
 * Old standalone Activity URL (`/activity?session_id=…`): Activity now lives
 * inside the campaign workspace, so forward there.
 */
export default function ActivityRedirect() {
  const router = useRouter();
  useEffect(() => {
    const id =
      new URLSearchParams(window.location.search).get("session_id") ?? rememberedCampaign();
    router.replace(id ? `/c/${id}/activity/sent` : "/");
  }, [router]);
  return (
    <div className="gate" aria-busy="true">
      <span className="kami-seal kami-seal--lg gate__seal" aria-hidden>
        K
      </span>
      <span className="sr-only">Opening Activity…</span>
    </div>
  );
}
