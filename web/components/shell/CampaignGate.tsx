"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CampaignProvider } from "@/components/campaign/CampaignProvider";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { forgetCampaign, rememberCampaign } from "@/lib/client/lastCampaign";
import type { CampaignView } from "@/lib/campaigns/sessions";

/**
 * Loads a campaign by id and provides it to `children`. `require` decides
 * where an incomplete campaign belongs: the workspace needs a confirmed
 * dossier (else → onboarding); onboarding sends a confirmed one onward.
 */
export default function CampaignGate({
  id,
  require,
  children,
}: {
  id: string;
  require: "confirmed" | "any";
  children: ReactNode;
}) {
  const router = useRouter();
  const [view, setView] = useState<CampaignView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<CampaignView>(`/api/sessions/${id}`)
      .then((v) => {
        if (cancelled) return;
        rememberCampaign(id);
        if (require === "confirmed" && !v.session.dossier_confirmed_at) {
          router.replace(`/start/${id}`);
          return;
        }
        setView(v);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
          forgetCampaign();
          router.replace("/");
          return;
        }
        setError(errorMessage(err, "Could not open this campaign"));
      });
    return () => {
      cancelled = true;
    };
  }, [id, require, router, version]);

  if (error) {
    return (
      <div className="gate">
        <Callout
          tone="error"
          title="Kami couldn’t open this campaign"
          actions={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setError(null);
                setVersion((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          {error}
        </Callout>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="gate" aria-busy="true" aria-live="polite">
        <span className="kami-seal kami-seal--lg gate__seal" aria-hidden>
          K
        </span>
        <span className="sr-only">Opening your campaign…</span>
      </div>
    );
  }
  return (
    <CampaignProvider key={view.session.id} initial={view}>
      {children}
    </CampaignProvider>
  );
}
