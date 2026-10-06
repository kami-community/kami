"use client";

import { useState } from "react";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import PlanTab from "@/components/sales/PlanTab";
import SalesStepper, { SalesProgressLine } from "@/components/sales/SalesStepper";
import { salesGates, salesSteps, stepperCollapsed, tabGate } from "@/components/sales/salesSteps";
import SalesTargetReview from "@/components/sales/target-review/SalesTargetReview";
import { useSalesPlan } from "@/components/sales/useSalesPlan";
import SalesDraftQueue from "@/components/SalesDraftQueue";
import SalesPipeline from "@/components/SalesPipeline";
import SalesSetup from "@/components/SalesSetup";
import AreaTabs, { type AreaTab } from "@/components/shell/AreaTabs";
import { useWorkspace } from "@/components/shell/WorkspaceContext";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import EmptyState from "@/components/ui/EmptyState";
import { IconLock, IconPause, IconPlay, IconShield, IconSparkle } from "@/components/ui/icons";
import { Page, PageHeader } from "@/components/ui/Page";
import { StatusPill } from "@/components/ui/Pills";
import Skeleton from "@/components/ui/Skeleton";
import { api, errorMessage } from "@/lib/client/api";
import { SALES_TABS, type SalesTab } from "@/lib/client/routes";
import type { SalesSegment } from "@/lib/domain/segments";
import type { SalesCampaignConfig } from "@/lib/salesTypes";

const LEDES: Record<SalesTab, string> = {
  plan: "Tell Kami who you sell to, then approve a small first batch.",
  companies:
    "Pick the companies that should get emails. Kami only uses emails it can show evidence for.",
  emails: "Check each draft, approve it, then send. Your click is the approval.",
  pipeline: "Every company and where it stands.",
};

const ASK: Record<SalesTab, string> = {
  plan: "Is this outbound plan right for my company? What would you change?",
  companies: "Which of these companies should I email first, and why?",
  emails: "How could these emails be better?",
  pipeline: "What should I do next with my pipeline?",
};

/** Find customers: a setup stepper over the Plan · Companies · Emails · Pipeline tabs. */
export default function SalesArea({ tab }: { tab: SalesTab }) {
  const { navigate, href, askGuide } = useWorkspace();
  const campaign = useCampaign();
  const { sessionId, session, progress, setupError } = campaign;
  const config = campaign.salesConfig;
  const plan = useSalesPlan(sessionId, Boolean(config), campaign.refreshProgress);
  const [pendingPaused, setPendingPaused] = useState<boolean | null>(null);
  const [pauseError, setPauseError] = useState<string | null>(null);

  const go = (t: SalesTab) => navigate({ area: "sales", tab: t });

  // Gates come from server progress; the config and the plan just returned by
  // the server win while progress catches up.
  const server = salesGates(progress, Boolean(config));
  const gates = {
    ...server,
    segmentsConfirmed: Boolean(config?.segments_confirmed_at) || server.segmentsConfirmed,
    planApproved: plan.plan ? plan.plan.status === "approved" : server.planApproved,
  };
  const steps = salesSteps(gates);
  const paused = pendingPaused ?? config?.autonomous_paused ?? progress?.sales.paused ?? false;
  const configLoading = !config && !setupError && (!progress || progress.sales.configured);

  async function setSalesPaused(next: boolean) {
    if (!config) return;
    setPendingPaused(next);
    setPauseError(null);
    try {
      const json = await api.patch<{ config: SalesCampaignConfig }>("/api/sales/setup", {
        session_id: sessionId,
        autonomous_paused: next,
      });
      campaign.setSalesConfig({ ...config, autonomous_paused: json.config.autonomous_paused });
      campaign.refreshProgress();
    } catch (err) {
      setPauseError(errorMessage(err, "Could not change the pause"));
    } finally {
      setPendingPaused(null);
    }
  }

  if (setupError && !config) {
    return (
      <Page>
        <Callout tone="error" title="Could not load Find customers">
          {setupError}
        </Callout>
      </Page>
    );
  }

  if (configLoading) {
    return (
      <Page>
        <Skeleton title lines={6} />
      </Page>
    );
  }

  // First visit: a focused setup (who and what), prefilled from the dossier.
  if (!config && tab === "plan") {
    return (
      <Page>
        <PageHeader
          title="Find customers"
          lede="Tell Kami what you sell and who buys it. It’s prefilled from your company profile — fix anything that looks wrong."
        />
        <SalesStepper steps={steps} onSelect={go} />
        <SalesSetup
          embedded
          sessionDbId={sessionId}
          dossier={campaign.dossier}
          domain={session.canonical_domain}
          goals={session.goals}
          existingConfig={null}
          onComplete={(c) => {
            campaign.setSalesConfig(c);
            plan.reset();
            campaign.refreshProgress();
          }}
        />
      </Page>
    );
  }

  const drafts = progress?.sales.drafts;
  const tabs: AreaTab<SalesTab>[] = SALES_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    href: href({ area: "sales", tab: t.key }),
    count: t.key === "emails" ? drafts?.pending || undefined : undefined,
    hint: tabGate(t.key, gates)?.hint,
  }));
  const gate = tabGate(tab, gates);
  const segments = (config?.segments as SalesSegment[] | null | undefined) ?? null;
  const sendingPaused = paused || session.paused;

  return (
    <Page wide={tab === "companies" || tab === "pipeline"}>
      <PageHeader
        eyebrow={
          paused ? (
            <StatusPill tone="red">Sales paused</StatusPill>
          ) : (
            <StatusPill tone="green">
              <IconShield size={11} /> Approval before every send
            </StatusPill>
          )
        }
        title="Find customers"
        lede={LEDES[tab]}
        actions={
          <>
            {config && (
              <Button
                size="sm"
                variant="secondary"
                aria-pressed={paused}
                busy={pendingPaused !== null}
                icon={paused ? <IconPlay size={12} /> : <IconPause size={12} />}
                onClick={() => void setSalesPaused(!paused)}
              >
                {paused ? "Resume Sales" : "Pause Sales"}
              </Button>
            )}
            <Button
              size="sm"
              variant="quiet"
              icon={<IconSparkle size={13} />}
              onClick={() => askGuide(ASK[tab])}
            >
              Ask Kami
            </Button>
          </>
        }
      />
      {pauseError && (
        <div className="sales-area__alert">
          <Callout tone="error">{pauseError}</Callout>
        </div>
      )}

      {stepperCollapsed(gates) ? (
        <SalesProgressLine
          companies={progress?.sales.accounts ?? 0}
          sent={drafts?.sent ?? 0}
          toReview={(drafts?.pending ?? 0) + (drafts?.approved ?? 0)}
          onOpenEmails={() => go("emails")}
        />
      ) : (
        <SalesStepper steps={steps} onSelect={go} />
      )}

      <AreaTabs label="Find customers" tabs={tabs} active={tab} onSelect={go} />

      <div className="fade-up" key={tab}>
        {gate ? (
          <EmptyState
            title={gate.hint}
            icon={<IconLock size={16} />}
            action={
              <Button variant="accent" size="sm" onClick={() => go(gate.goTo)}>
                {gate.cta}
              </Button>
            }
          >
            Kami works through these steps in order, so nothing goes out before you approve it.
          </EmptyState>
        ) : tab === "plan" && config ? (
          <PlanTab
            config={config}
            segmentsConfirmed={gates.segmentsConfirmed}
            plan={plan}
            onPlanApproved={() => go("companies")}
            onEditSettings={() => navigate({ area: "settings", tab: "sending" })}
          />
        ) : tab === "companies" && plan.loading && !plan.plan ? (
          <Skeleton title lines={5} />
        ) : tab === "companies" && config ? (
          <SalesTargetReview
            sessionDbId={sessionId}
            plan={plan.plan}
            offer={config.offer}
            segments={segments}
            paused={sendingPaused}
            onContinue={() => {
              campaign.refreshProgress();
              go("emails");
            }}
            onCreateDistribution={() => navigate({ area: "distribution", tab: "opportunities" })}
          />
        ) : tab === "emails" ? (
          <SalesDraftQueue
            sessionDbId={sessionId}
            paused={sendingPaused}
            onChanged={campaign.refreshProgress}
            onSent={campaign.refreshProgress}
          />
        ) : tab === "pipeline" ? (
          <SalesPipeline sessionDbId={sessionId} onFindCompanies={() => go("companies")} />
        ) : null}
      </div>
    </Page>
  );
}
