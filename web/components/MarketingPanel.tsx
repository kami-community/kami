"use client";

import { useCallback, useEffect, useState } from "react";
import type { MarketingConfig } from "@/lib/marketingTypes";
import type { DistributionCampaignConfig, DistributionOpportunity } from "@/lib/distributionTypes";
import DistributionSetup from "@/components/DistributionSetup";
import OpportunityQueue from "@/components/OpportunityQueue";
import MarketingCRM from "@/components/MarketingCRM";
import MarketingSetup from "@/components/MarketingSetup";
import ConversationsPanel from "@/components/ConversationsPanel";
import PlatformRail from "@/components/PlatformRail";
import KillSwitch from "@/components/KillSwitch";
import CapabilityBanner from "@/components/CapabilityBanner";
import type { MarketingCrmEntry, Conversation } from "@/lib/marketingTypes";

interface MarketingPanelProps {
  sessionDbId: string | null;
  config: MarketingConfig | null;
  dossierTone?: string[];
  onSetup: (config: MarketingConfig) => void;
}

export default function MarketingPanel({
  sessionDbId,
  config,
  dossierTone,
  onSetup,
}: MarketingPanelProps) {
  const [distConfig, setDistConfig] = useState<DistributionCampaignConfig | null>(null);
  const [opportunities, setOpportunities] = useState<DistributionOpportunity[]>([]);
  const [researchNote, setResearchNote] = useState<string | null>(null);
  const [researchSource, setResearchSource] = useState<string | null>(null);
  const [researchBusy, setResearchBusy] = useState(false);
  const [showAdvancedCrm, setShowAdvancedCrm] = useState(false);
  const [crmSettings, setCrmSettings] = useState(false);
  const [entries, setEntries] = useState<MarketingCrmEntry[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [platformFilter, setPlatformFilter] = useState<"all" | "x" | "instagram">("all");
  const [paused, setPaused] = useState(false);
  const [pauseSaving, setPauseSaving] = useState(false);

  const fetchDist = useCallback(() => {
    if (!sessionDbId) return;
    fetch(`/api/marketing/distribution/setup?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => {
        setDistConfig(j.config ?? null);
        setPaused(Boolean(j.config?.autonomous_paused));
      })
      .catch(() => {});
  }, [sessionDbId]);

  const fetchOpps = useCallback(() => {
    if (!sessionDbId) return;
    fetch(`/api/marketing/distribution/opportunities?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => setOpportunities(j.opportunities ?? []))
      .catch(() => {});
  }, [sessionDbId]);

  const fetchCrm = useCallback(() => {
    if (!sessionDbId) return;
    fetch(`/api/marketing/crm?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => setEntries(j.entries ?? []))
      .catch(() => {});
  }, [sessionDbId]);

  const fetchConversations = useCallback(() => {
    if (!sessionDbId) return;
    fetch(`/api/marketing/conversations?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => setConversations(j.conversations ?? []))
      .catch(() => {});
  }, [sessionDbId]);

  useEffect(() => {
    fetchDist();
    fetchOpps();
  }, [fetchDist, fetchOpps]);

  useEffect(() => {
    if (showAdvancedCrm) {
      fetchCrm();
      fetchConversations();
    }
  }, [showAdvancedCrm, fetchCrm, fetchConversations]);

  async function handlePauseChange(nextPaused: boolean) {
    if (!sessionDbId) return;
    setPaused(nextPaused);
    setPauseSaving(true);
    try {
      const res = await fetch("/api/marketing/distribution/setup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionDbId, autonomous_paused: nextPaused }),
      });
      const json = await res.json();
      if (res.ok && json.config) setDistConfig(json.config);
    } catch {
      setPaused(!nextPaused);
    } finally {
      setPauseSaving(false);
    }
  }

  async function runResearch() {
    if (!sessionDbId) return;
    setResearchBusy(true);
    setResearchNote(null);
    try {
      const res = await fetch("/api/marketing/distribution/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionDbId, action: "research" }),
      });
      const json = await res.json();
      if (res.ok) {
        setOpportunities(json.opportunities ?? []);
        setResearchSource(json.source ?? null);
        setResearchNote(json.note ?? null);
      } else {
        setResearchNote(json.error ?? "Research failed");
      }
    } finally {
      setResearchBusy(false);
    }
  }

  const needsPlanConfirm = !distConfig || distConfig.status !== "approved";

  if (needsPlanConfirm) {
    return (
      <div>
        <CapabilityBanner />
        <DistributionSetup
          sessionDbId={sessionDbId}
          initialConfig={distConfig}
          onComplete={(c) => {
            setDistConfig(c);
          }}
        />
      </div>
    );
  }

  if (showAdvancedCrm) {
    if (!config || crmSettings) {
      return (
        <div>
          <button
            type="button"
            className="mono"
            onClick={() => setShowAdvancedCrm(false)}
            style={{
              marginBottom: "var(--stack-sm)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            ← Back to distribution
          </button>
          <MarketingSetup
            sessionDbId={sessionDbId}
            existingTone={dossierTone}
            onComplete={(c) => {
              onSetup(c);
              setCrmSettings(false);
            }}
          />
        </div>
      );
    }

    const filtered =
      platformFilter === "all" ? entries : entries.filter((e) => e.platform === platformFilter);

    return (
      <div>
        <button
          type="button"
          className="mono"
          onClick={() => setShowAdvancedCrm(false)}
          style={{
            marginBottom: "var(--stack-sm)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          ← Back to distribution
        </button>
        <p
          className="mono"
          style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: "var(--stack-sm)" }}
        >
          Advanced · X/IG CRM & cold DMs (later feature — not the default Marketing loop)
        </p>
        <div className="dashboard-grid">
          <PlatformRail
            config={config}
            entries={entries}
            activeFilter={platformFilter}
            onFilter={setPlatformFilter}
            onOpenSettings={() => setCrmSettings(true)}
          />
          <MarketingCRM
            entries={filtered}
            config={config}
            sessionDbId={sessionDbId}
            paused={Boolean(config.autonomous_paused)}
            onRefresh={fetchCrm}
          />
          <ConversationsPanel
            conversations={conversations}
            entries={entries}
            onRefresh={fetchConversations}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <CapabilityBanner />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--stack-sm)",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div>
          <p className="label-caps">Distribution</p>
          <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            {distConfig.goal_label || distConfig.goal.replace(/_/g, " ")}
            {distConfig.angle ? ` · ${distConfig.angle.slice(0, 80)}` : ""}
            {distConfig.surfaces?.length ? ` · ${distConfig.surfaces.join(", ")}` : ""}
          </p>
        </div>
        <KillSwitch
          paused={paused}
          onChange={handlePauseChange}
          disabled={pauseSaving || !sessionDbId}
        />
      </div>
      <hr className="crease" />

      <OpportunityQueue
        opportunities={opportunities}
        sessionDbId={sessionDbId}
        researchNote={researchNote}
        researchSource={researchSource}
        busy={researchBusy}
        onRefresh={fetchOpps}
        onResearch={runResearch}
      />

      <details style={{ marginTop: "var(--stack-lg)" }}>
        <summary className="mono" style={{ cursor: "pointer", color: "var(--ink-soft)" }}>
          More — Advanced CRM (later feature)
        </summary>
        <p style={{ color: "var(--ink-soft)", marginTop: "0.5rem", marginBottom: "0.75rem" }}>
          Cold DM / creator CRM is preserved but not the primary Marketing product. Open only if you
          know what you&apos;re doing.
        </p>
        <button
          type="button"
          className="mono"
          onClick={() => setShowAdvancedCrm(true)}
          style={{
            border: "1px solid var(--ink)",
            background: "transparent",
            padding: "0.4rem 0.75rem",
            cursor: "pointer",
          }}
        >
          Open Advanced CRM
        </button>
      </details>
    </div>
  );
}
