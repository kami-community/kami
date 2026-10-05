"use client";

import { useEffect, useState } from "react";
import ActivityFeed, { type ActivityEvent } from "@/components/ActivityFeed";
import IntelPanel from "@/components/IntelPanel";
import KamiGuide from "@/components/KamiGuide";
import CampaignTabs from "@/components/CampaignTabs";
import MarketingPanel from "@/components/MarketingPanel";
import SalesPanel, { type SalesGuidedStep } from "@/components/SalesPanel";
import CapabilityBanner from "@/components/CapabilityBanner";
import KillSwitch from "@/components/KillSwitch";
import DossierConfirm from "@/components/DossierConfirm";
import type { Dossier } from "@/lib/hermes";
import type { CampaignTab, MarketingConfig } from "@/lib/marketingTypes";
import type { SalesCampaignConfig } from "@/lib/salesTypes";

interface DashboardProps {
  domain: string;
  events: ActivityEvent[];
  running: boolean;
  dossier: Dossier | null;
  sessionId: string;
  sessionDbId: string | null;
  marketingConfig: MarketingConfig | null;
  salesConfig: SalesCampaignConfig | null;
  identityMeta?: { company?: string | null; confidence?: number; evidenceCount?: number } | null;
  sessionGoals?: string[];
  onNewCampaign: () => void;
  onMarketingSetup: (config: MarketingConfig) => void;
  onSalesSetup: (config: SalesCampaignConfig) => void;
  onDossierUpdated: (dossier: Dossier) => void;
}

type OverviewPhase = "loading" | "confirm" | "choose";

export default function Dashboard({
  domain,
  events,
  running,
  dossier,
  sessionId,
  sessionDbId,
  marketingConfig,
  salesConfig,
  identityMeta,
  sessionGoals,
  onNewCampaign,
  onMarketingSetup,
  onSalesSetup,
  onDossierUpdated,
}: DashboardProps) {
  const [tab, setTab] = useState<CampaignTab>("overview");
  const [salesFocusStep, setSalesFocusStep] = useState<SalesGuidedStep | null>(null);
  const [dossierConfirmed, setDossierConfirmed] = useState(false);
  const [guideCollapsed, setGuideCollapsed] = useState(false);
  const [globalPaused, setGlobalPaused] = useState(false);
  const [pauseSaving, setPauseSaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionDbId) return;
    const key = `kami_dossier_confirmed_${sessionDbId}`;
    setDossierConfirmed(window.localStorage.getItem(key) === "1");
  }, [sessionDbId]);

  const overviewPhase: OverviewPhase = !dossier
    ? "loading"
    : dossierConfirmed
      ? "choose"
      : "confirm";

  function confirmDossier() {
    setDossierConfirmed(true);
    if (typeof window !== "undefined" && sessionDbId) {
      window.localStorage.setItem(`kami_dossier_confirmed_${sessionDbId}`, "1");
    }
  }

  function findCustomers() {
    setTab("sales");
    setSalesFocusStep(salesConfig ? null : "confirm");
  }

  function createDistribution() {
    setTab("marketing");
  }

  async function handleGlobalPause(next: boolean) {
    setGlobalPaused(next);
    if (!sessionDbId) return;
    setPauseSaving(true);
    try {
      await Promise.all([
        fetch("/api/sales/setup", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionDbId, autonomous_paused: next }),
        }).catch(() => null),
        fetch("/api/marketing/distribution/setup", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionDbId, autonomous_paused: next }),
        }).catch(() => null),
        fetch("/api/marketing/setup", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionDbId, autonomous_paused: next }),
        }).catch(() => null),
      ]);
    } finally {
      setPauseSaving(false);
    }
  }

  return (
    <div style={{ paddingTop: "var(--stack-md)", paddingBottom: "var(--stack-lg)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <h2>
          {domain} <span style={{ color: "var(--hanko)" }}>· campaigns</span>
        </h2>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <KillSwitch
            paused={globalPaused}
            onChange={handleGlobalPause}
            disabled={pauseSaving || !sessionDbId}
          />
          <span className="mono" style={{ color: "var(--ink-soft)" }}>
            session {sessionId.slice(-8)}
          </span>
          <button
            type="button"
            className="mono"
            onClick={onNewCampaign}
            style={{
              border: "1px solid var(--ink)",
              background: "transparent",
              padding: "0.3rem 0.7rem",
              cursor: "pointer",
            }}
          >
            + new campaign
          </button>
        </div>
      </div>

      <CapabilityBanner />
      <CampaignTabs active={tab} onChange={setTab} />

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 0,
          marginTop: "var(--stack-sm)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0, paddingRight: guideCollapsed ? 0 : "var(--stack-md)" }}>
          {tab === "overview" && (
            <>
              <hr className="crease" />
              {identityMeta && (
                <p
                  className="mono"
                  style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: "var(--stack-sm)" }}
                >
                  Identity: {identityMeta.company ?? domain}
                  {typeof identityMeta.confidence === "number"
                    ? ` · confidence ${(identityMeta.confidence * 100).toFixed(0)}%`
                    : ""}
                  {identityMeta.evidenceCount ? ` · ${identityMeta.evidenceCount} sources` : ""}
                </p>
              )}

              {overviewPhase === "loading" && (
                <div style={{ marginTop: "var(--stack-md)" }}>
                  <p className="label-caps">Understanding your company</p>
                  <p style={{ color: "var(--ink-soft)", marginTop: "0.5rem" }}>
                    Kami is folding a dossier from your domain…
                  </p>
                  <ActivityFeed events={events} running={running} />
                </div>
              )}

              {overviewPhase === "confirm" && dossier && (
                <DossierConfirm
                  dossier={dossier}
                  sessionDbId={sessionDbId}
                  onConfirm={confirmDossier}
                  onDossierUpdated={onDossierUpdated}
                />
              )}

              {overviewPhase === "choose" && dossier && (
                <div style={{ marginTop: "var(--stack-md)", width: "100%" }}>
                  <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
                    What should I do next to grow?
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                      gap: "var(--stack-md)",
                      marginBottom: "var(--stack-md)",
                    }}
                  >
                    <div className="kraft-card" style={{ padding: "var(--stack-md)" }}>
                      <h3 style={{ marginBottom: "0.5rem" }}>Find customers</h3>
                      <p style={{ color: "var(--ink-soft)", marginBottom: "var(--stack-md)" }}>
                        Reach people who could become customers — verify companies, draft emails,
                        approve before send.
                      </p>
                      <button type="button" className="hanko-btn" onClick={findCustomers}>
                        Find customers
                      </button>
                    </div>
                    <div className="kraft-card" style={{ padding: "var(--stack-md)" }}>
                      <h3 style={{ marginBottom: "0.5rem" }}>Create distribution</h3>
                      <p style={{ color: "var(--ink-soft)", marginBottom: "var(--stack-md)" }}>
                        Show up in the right conversations with a useful message — review
                        opportunities, then post.
                      </p>
                      <button type="button" className="hanko-btn" onClick={createDistribution}>
                        Create distribution
                      </button>
                    </div>
                  </div>

                  <IntelPanel dossier={dossier} defaultAllOpen />
                  <div style={{ marginTop: "var(--stack-md)" }}>
                    <ActivityFeed events={events} running={running} />
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "marketing" && (
            <MarketingPanel
              sessionDbId={sessionDbId}
              config={marketingConfig}
              dossierTone={dossier?.tone}
              onSetup={onMarketingSetup}
            />
          )}

          {tab === "sales" && (
            <SalesPanel
              sessionDbId={sessionDbId}
              config={salesConfig}
              dossier={dossier}
              domain={domain}
              goals={sessionGoals}
              focusStep={salesFocusStep}
              onSetup={onSalesSetup}
              onCreateDistribution={createDistribution}
            />
          )}
        </div>

        {(dossier || sessionDbId) && (
          <KamiGuide
            sessionId={sessionId}
            domain={domain}
            dossier={dossier}
            sessionDbId={sessionDbId}
            salesConfig={salesConfig}
            goals={sessionGoals}
            activeTab={tab}
            collapsed={guideCollapsed}
            onToggle={() => setGuideCollapsed((c) => !c)}
          />
        )}
      </div>
    </div>
  );
}
