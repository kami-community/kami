"use client";

import Link from "next/link";
import { useState } from "react";
import CampaignTabs from "@/components/CampaignTabs";
import CapabilityBanner from "@/components/CapabilityBanner";
import ConfirmDialog from "@/components/ConfirmDialog";
import DossierConfirm from "@/components/DossierConfirm";
import IntelPanel from "@/components/IntelPanel";
import KamiGuide from "@/components/KamiGuide";
import KillSwitch from "@/components/KillSwitch";
import MarketingPanel from "@/components/MarketingPanel";
import SalesPanel, { type SalesGuidedStep } from "@/components/SalesPanel";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import { errorMessage } from "@/lib/client/api";
import type { CampaignTab } from "@/lib/marketingTypes";

/** Campaign workspace: Overview (dossier → choose a job), Sales, Marketing, plus Kami Guide. */
export default function Dashboard({ onNewCampaign }: { onNewCampaign: () => void }) {
  const campaign = useCampaign();
  const { session, sessionId, dossier, dossierJob } = campaign;
  const [tab, setTab] = useState<CampaignTab>("overview");
  const [salesFocusStep, setSalesFocusStep] = useState<SalesGuidedStep | null>(null);
  const [guideCollapsed, setGuideCollapsed] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [pauseSaving, setPauseSaving] = useState(false);
  const [confirmingNew, setConfirmingNew] = useState(false);

  const confirmed = Boolean(session.dossier_confirmed_at);
  const identity = session.domain_check;
  const sourceCount = session.research_snapshot?.sources?.length ?? 0;

  async function togglePause(next: boolean) {
    setPauseSaving(true);
    setPauseError(null);
    try {
      await campaign.setPaused(next);
    } catch (err) {
      setPauseError(errorMessage(err, "Could not change the kill switch"));
    } finally {
      setPauseSaving(false);
    }
  }

  function findCustomers() {
    setTab("sales");
    setSalesFocusStep(campaign.salesConfig ? null : "confirm");
  }

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <h2>
          {session.canonical_domain} <span className="brand-accent">· campaigns</span>
        </h2>
        <div className="dashboard__actions">
          <KillSwitch paused={session.paused} onChange={togglePause} disabled={pauseSaving} />
          <Link className="mono btn-outline" href={`/activity?session_id=${sessionId}`}>
            Activity
          </Link>
          <button type="button" className="mono btn-outline" onClick={() => setConfirmingNew(true)}>
            + new campaign
          </button>
        </div>
      </header>
      {pauseError && (
        <p role="alert" className="mono form-error">
          {pauseError}
        </p>
      )}
      {session.paused && (
        <p role="status" className="mono paused-banner">
          Kami is paused for this campaign — nothing will be sent or posted until you resume.
        </p>
      )}

      <CapabilityBanner />
      <CampaignTabs active={tab} onChange={setTab} />

      <div className="dashboard__body">
        <div
          className="dashboard__main"
          data-guide-open={!guideCollapsed}
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          {tab === "overview" && (
            <>
              <hr className="crease" />
              <p className="mono meta-line">
                Identity: {identity.company_name ?? session.canonical_domain} · confidence{" "}
                {(identity.confidence * 100).toFixed(0)}% · {sourceCount} sources
              </p>

              {!dossier && (
                <section className="overview-section" aria-live="polite">
                  <p className="label-caps">Understanding your company</p>
                  {dossierJob.busy && (
                    <p className="muted">
                      The brand analyst is compiling your dossier from your site and research…
                    </p>
                  )}
                  {dossierJob.error && (
                    <>
                      <p role="alert" className="mono form-error">
                        {dossierJob.error}
                      </p>
                      <button
                        type="button"
                        className="hanko-btn"
                        onClick={() => void campaign.generateDossier()}
                      >
                        Try again
                      </button>
                    </>
                  )}
                </section>
              )}

              {dossier && !confirmed && (
                <DossierConfirm
                  dossier={dossier}
                  sessionDbId={sessionId}
                  onConfirm={campaign.confirmDossier}
                  onDossierUpdated={campaign.setDossier}
                />
              )}

              {dossier && confirmed && (
                <section className="overview-section">
                  <p className="label-caps">What should I do next to grow?</p>
                  <div className="job-grid">
                    <div className="kraft-card job-card">
                      <h3>Find customers</h3>
                      <p className="muted">
                        Reach people who could become customers — verify companies, draft emails,
                        approve before send.
                      </p>
                      <button type="button" className="hanko-btn" onClick={findCustomers}>
                        Find customers
                      </button>
                    </div>
                    <div className="kraft-card job-card">
                      <h3>Create distribution</h3>
                      <p className="muted">
                        Show up in the right conversations with a useful message — review
                        opportunities, then post.
                      </p>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setTab("marketing")}
                      >
                        Create distribution
                      </button>
                    </div>
                  </div>
                  <IntelPanel dossier={dossier} defaultAllOpen />
                </section>
              )}
            </>
          )}

          {tab !== "overview" && !confirmed && (
            <p className="muted overview-section">
              Confirm your company dossier on the Overview tab first — Kami plans from what you
              confirm.
            </p>
          )}

          {tab === "marketing" && confirmed && (
            <MarketingPanel
              sessionDbId={sessionId}
              config={campaign.marketingConfig}
              dossierTone={dossier?.tone}
              onSetup={campaign.setMarketingConfig}
            />
          )}

          {tab === "sales" && confirmed && (
            <SalesPanel
              sessionDbId={sessionId}
              config={campaign.salesConfig}
              dossier={dossier}
              domain={session.canonical_domain}
              goals={session.goals}
              focusStep={salesFocusStep}
              onSetup={campaign.setSalesConfig}
              onCreateDistribution={() => setTab("marketing")}
            />
          )}
        </div>

        <KamiGuide
          activeTab={tab}
          collapsed={guideCollapsed}
          onToggle={() => setGuideCollapsed((c) => !c)}
        />
      </div>

      <ConfirmDialog
        open={confirmingNew}
        title="Start a new campaign?"
        body="This campaign stays saved in your database, but this browser will stop reopening it."
        confirmLabel="Start new campaign"
        onConfirm={() => {
          setConfirmingNew(false);
          onNewCampaign();
        }}
        onCancel={() => setConfirmingNew(false)}
      />
    </div>
  );
}
