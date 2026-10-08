"use client";

import BoostManager from "@/components/BoostManager";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import OpportunitiesTab from "@/components/distribution/OpportunitiesTab";
import { useDistributionPlan } from "@/components/distribution/useDistributionPlan";
import DistributionSetup from "@/components/DistributionSetup";
import MarketingCRM from "@/components/MarketingCRM";
import ViewLink from "@/components/settings/ViewLink";
import AreaTabs, { type AreaTab } from "@/components/shell/AreaTabs";
import { useWorkspace } from "@/components/shell/WorkspaceContext";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { IconPause, IconPlay, IconSparkle } from "@/components/ui/icons";
import { Page, PageHeader } from "@/components/ui/Page";
import { StatusPill } from "@/components/ui/Pills";
import Skeleton from "@/components/ui/Skeleton";
import { DISTRIBUTION_TABS, type DistributionTab } from "@/lib/client/routes";

const LEDES: Record<DistributionTab, string> = {
  opportunities:
    "Live conversations on your approved surfaces, each with a drafted contribution. Review it, post it, then tell Kami what happened.",
  plan: "The job, angle and surfaces Kami researches against. Change it any time.",
  boosts:
    "Paid X boosts of your own posts. Every boost shows its spend and waits for your confirmation.",
  creators: "X leads, Instagram creators and DM conversations. Every DM waits for your click.",
};

/**
 * Distribution: today's opportunities (default), the plan they come from,
 * and — behind Advanced — paid boosts and the creator CRM. Research only
 * starts once the founder approves a plan.
 */
export default function DistributionArea({ tab }: { tab: DistributionTab }) {
  const campaign = useCampaign();
  const { sessionId, session, progress, dossier } = campaign;
  const { href, navigate, askGuide } = useWorkspace();
  const plan = useDistributionPlan();
  const { config, approved, paused } = plan;
  const killSwitch = session.paused;
  const needsReview = progress?.marketing.opportunities.needsReview ?? 0;

  const tabs: AreaTab<DistributionTab>[] = DISTRIBUTION_TABS.map((t) => ({
    ...t,
    href: href({ area: "distribution", tab: t.key }),
    count: t.key === "opportunities" && approved ? needsReview : undefined,
    hint: t.key !== "plan" && !approved && !plan.loading ? "Approve a plan first" : undefined,
  }));

  const status = plan.loading ? null : !config || !approved ? (
    <StatusPill tone="orange">Plan not approved</StatusPill>
  ) : paused || killSwitch ? (
    <StatusPill tone="red">Paused</StatusPill>
  ) : (
    <StatusPill tone="green">Running</StatusPill>
  );

  return (
    <Page wide={tab === "creators" && approved}>
      <PageHeader
        eyebrow={status}
        title="Distribution"
        lede={!plan.loading && !approved && tab !== "plan" ? LEDES.plan : LEDES[tab]}
        actions={
          <>
            <Button
              size="sm"
              variant="quiet"
              icon={<IconSparkle size={12} />}
              onClick={() => askGuide("What should I post this week, and where?")}
            >
              Ask Kami
            </Button>
            {approved && (
              <Button
                size="sm"
                variant="secondary"
                aria-pressed={paused}
                busy={plan.pauseBusy}
                icon={paused ? <IconPlay size={12} /> : <IconPause size={12} />}
                onClick={() => void plan.togglePause()}
              >
                {paused ? "Resume distribution" : "Pause distribution"}
              </Button>
            )}
          </>
        }
      />

      <AreaTabs
        label="Distribution"
        tabs={tabs}
        active={tab}
        onSelect={(key) => navigate({ area: "distribution", tab: key })}
      />

      <div className="stack dist-notices">
        {plan.pauseError && <Callout tone="error">{plan.pauseError}</Callout>}
        {killSwitch ? (
          <Callout tone="warn" title="The kill switch is on">
            Nothing is researched, posted or sent anywhere until you turn it off in the sidebar.
          </Callout>
        ) : (
          paused &&
          approved && (
            <Callout tone="warn" title="Distribution is paused">
              Kami won’t research or post until you resume. Find customers keeps running.
            </Callout>
          )
        )}
      </div>

      {plan.error ? (
        <Callout
          tone="error"
          title="Could not load your distribution plan"
          actions={
            <Button size="sm" variant="secondary" onClick={plan.reload}>
              Retry
            </Button>
          }
        >
          {plan.error}
        </Callout>
      ) : plan.loading ? (
        <Skeleton title lines={5} />
      ) : (
        <div className="fade-up" key={tab}>
          {tab === "plan" ? (
            <DistributionSetup
              sessionDbId={sessionId}
              initialConfig={config}
              editApproved
              onComplete={(next) => {
                plan.update(next);
                if (next.status === "approved")
                  navigate({ area: "distribution", tab: "opportunities" });
              }}
            />
          ) : approved && config && tab === "opportunities" ? (
            <OpportunitiesTab
              sessionId={sessionId}
              config={config}
              paused={paused || killSwitch}
              onChanged={campaign.refreshProgress}
            />
          ) : approved && tab === "boosts" ? (
            <BoostManager
              sessionDbId={sessionId}
              connectX={
                <ViewLink to={{ area: "settings", tab: "connections" }}>
                  Connect X in Settings
                </ViewLink>
              }
            />
          ) : approved && tab === "creators" ? (
            <MarketingCRM
              sessionId={sessionId}
              config={campaign.marketingConfig}
              dossierTone={dossier?.tone}
              onSetup={campaign.setMarketingConfig}
            />
          ) : (
            <>
              <Callout tone="neutral" title="First, approve a plan">
                Kami’s Distribution manager reads your dossier and recommends one job, one angle and
                up to three places to show up. Approve it (or edit it) and Kami starts looking for
                live conversations there. Nothing is researched, boosted or posted before you
                approve.
              </Callout>
              <DistributionSetup
                sessionDbId={sessionId}
                initialConfig={config}
                onComplete={(next) => {
                  plan.update(next);
                  if (next.status === "approved")
                    navigate({ area: "distribution", tab: "opportunities" });
                }}
              />
            </>
          )}
        </div>
      )}
    </Page>
  );
}
