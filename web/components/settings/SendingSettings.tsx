"use client";

import { useState } from "react";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import SalesSetup from "@/components/SalesSetup";
import ViewLink from "@/components/settings/ViewLink";
import Callout from "@/components/ui/Callout";
import Card, { CardBody } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { IconMail } from "@/components/ui/icons";
import { Section } from "@/components/ui/Page";
import Skeleton from "@/components/ui/Skeleton";
import Toggle from "@/components/ui/Toggle";
import { api, errorMessage } from "@/lib/client/api";

type Switch = "kill" | "sales" | "distribution";

/**
 * Settings → Sending: the stop switches (kill switch and per-area pauses)
 * and the Find customers email guardrails. Saving never sends anything.
 */
export default function SendingSettings() {
  const campaign = useCampaign();
  const { session, sessionId, progress, salesConfig, dossier, setupError } = campaign;
  const [busy, setBusy] = useState<Switch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function flip(which: Switch, next: boolean) {
    setBusy(which);
    setError(null);
    try {
      if (which === "kill") await campaign.setPaused(next);
      else if (which === "sales")
        await api.patch("/api/sales/setup", { session_id: sessionId, autonomous_paused: next });
      else
        await api.patch("/api/marketing/distribution/setup", {
          session_id: sessionId,
          autonomous_paused: next,
        });
      campaign.refreshProgress();
    } catch (err) {
      setError(errorMessage(err, "Could not change that switch"));
    } finally {
      setBusy(null);
    }
  }

  const salesConfigured = progress?.sales.configured ?? false;
  const distributionPlanned = (progress?.marketing.planStatus ?? "none") !== "none";

  return (
    <>
      <Section
        num="01"
        title="Stop switches"
        desc="Kami only acts when you click. These stop it even then — use them whenever something looks off."
      >
        <Card>
          <CardBody className="stack stack--sm">
            <Toggle
              checked={session.paused}
              disabled={busy !== null}
              onChange={(next) => void flip("kill", next)}
              label="Kill switch — stop everything"
              hint="Blocks every email, post, DM and boost on every channel, including ones you approve. Also in the sidebar."
            />
            {progress ? (
              <>
                <Toggle
                  checked={progress.sales.paused}
                  disabled={busy !== null || !salesConfigured}
                  onChange={(next) => void flip("sales", next)}
                  label="Pause Find customers"
                  hint={
                    salesConfigured
                      ? "Stops company research, email drafting and sends. Distribution keeps running."
                      : "Available once Find customers is set up."
                  }
                />
                <Toggle
                  checked={progress.marketing.paused}
                  disabled={busy !== null || !distributionPlanned}
                  onChange={(next) => void flip("distribution", next)}
                  label="Pause Distribution"
                  hint={
                    distributionPlanned
                      ? "Stops opportunity research and posting. Find customers keeps running."
                      : "Available once you have a distribution plan."
                  }
                />
              </>
            ) : (
              <Skeleton lines={2} />
            )}
          </CardBody>
        </Card>
        {(error ?? campaign.progressError) && (
          <div className="settings-note">
            <Callout tone="error">{error ?? campaign.progressError}</Callout>
          </div>
        )}
      </Section>

      <Section num="02" title="Find customers email" desc="Pace, approvals and who Kami writes to.">
        {!progress ? (
          <Skeleton title lines={5} />
        ) : !salesConfigured ? (
          <EmptyState
            title="Find customers isn’t set up yet"
            icon={<IconMail size={16} />}
            action={<ViewLink to={{ area: "sales", tab: "plan" }}>Set up Find customers</ViewLink>}
          >
            Sending guardrails appear here once you’ve told Kami who to reach.
          </EmptyState>
        ) : setupError ? (
          <Callout tone="error" title="Could not load your sending settings">
            {setupError}
          </Callout>
        ) : !salesConfig ? (
          <Skeleton title lines={5} />
        ) : (
          <div className="stack">
            <div aria-live="polite">{saved && <Callout tone="success">{saved}</Callout>}</div>
            <SalesSetup
              key={salesConfig.updated_at ?? salesConfig.id ?? "sales"}
              mode="settings"
              sessionDbId={sessionId}
              dossier={dossier}
              domain={session.canonical_domain}
              existingConfig={salesConfig}
              goals={session.goals}
              onComplete={(config) => {
                campaign.setSalesConfig(config);
                campaign.refreshProgress();
                setSaved("Sending settings saved. They apply to the next drafts and sends.");
              }}
            />
          </div>
        )}
      </Section>
    </>
  );
}
