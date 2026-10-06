"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { rememberedCampaign } from "@/lib/client/lastCampaign";

/**
 * The app root: reopen the campaign this browser last used, otherwise start
 * onboarding. Query parameters (e.g. an OAuth result) are carried along.
 */
export default function Root() {
  const router = useRouter();
  useEffect(() => {
    const id = rememberedCampaign();
    const query = window.location.search;
    router.replace(id ? `/c/${id}${query}` : `/start${query}`);
  }, [router]);
  return (
    <div className="gate" aria-busy="true">
      <span className="kami-seal kami-seal--lg gate__seal" aria-hidden>
        K
      </span>
      <span className="sr-only">Opening Kami…</span>
    </div>
  );
}
