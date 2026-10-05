"use client";

import { useState } from "react";
import type { Conversation, MarketingConfig, MarketingCrmEntry } from "@/lib/marketingTypes";
import type { DistributionCampaignConfig, DistributionOpportunity } from "@/lib/distributionTypes";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import DistributionSetup from "@/components/DistributionSetup";
import OpportunityQueue from "@/components/OpportunityQueue";
import MarketingCRM from "@/components/MarketingCRM";
import MarketingSetup from "@/components/MarketingSetup";
import ConversationsPanel from "@/components/ConversationsPanel";
import PlatformRail from "@/components/PlatformRail";
import CapabilityBanner from "@/components/CapabilityBanner";

interface MarketingPanelProps {
  sessionDbId: string | null;
  config: MarketingConfig | null;
  dossierTone?: string[];
  onSetup: (config: MarketingConfig) => void;
}

interface ResearchResult {
  opportunities: DistributionOpportunity[];
  source: string | null;
  note: string | null;
}

/**
 * Marketing = the distribution opportunity queue. The X/Instagram CRM and cold
 * DMs stay behind an "Advanced" disclosure.
 */
export default function MarketingPanel({
  sessionDbId,
  config,
  dossierTone,
  onSetup,
}: MarketingPanelProps) {
  const [showAdvancedCrm, setShowAdvancedCrm] = useState(false);

  const dist = useApi<{ config: DistributionCampaignConfig | null }>(
    sessionDbId
      ? withQuery("/api/marketing/distribution/setup", { session_id: sessionDbId })
      : null,
  );
  const distConfig = dist.data?.config ?? null;
  const [localConfig, setLocalConfig] = useState<DistributionCampaignConfig | null>(null);
  // The latest mutation result wins over the (possibly stale) loaded config.
  const activeConfig = localConfig ?? distConfig;

  if (!sessionDbId) {
    return <p className="fine-print">Start a campaign to create distribution.</p>;
  }

  if (dist.error && !activeConfig) {
    return (
      <div>
        <p role="alert" className="form-error">
          {dist.error}
        </p>
        <button type="button" className="btn-outline" onClick={dist.reload}>
          Retry
        </button>
      </div>
    );
  }

  if (dist.loading && !activeConfig) {
    return <p className="fine-print">Loading distribution…</p>;
  }

  if (!activeConfig) {
    return (
      <div>
        <CapabilityBanner />
        <DistributionSetup sessionDbId={sessionDbId} onComplete={setLocalConfig} />
      </div>
    );
  }

  if (showAdvancedCrm) {
    return (
      <AdvancedCrm
        sessionId={sessionDbId}
        config={config}
        dossierTone={dossierTone}
        onSetup={onSetup}
        onBack={() => setShowAdvancedCrm(false)}
      />
    );
  }

  return (
    <DistributionView
      sessionId={sessionDbId}
      config={activeConfig}
      onConfigChange={(next) => {
        setLocalConfig(next);
        dist.reload();
      }}
      onOpenAdvanced={() => setShowAdvancedCrm(true)}
    />
  );
}

function DistributionView({
  sessionId,
  config,
  onConfigChange,
  onOpenAdvanced,
}: {
  sessionId: string;
  config: DistributionCampaignConfig;
  onConfigChange: (config: DistributionCampaignConfig) => void;
  onOpenAdvanced: () => void;
}) {
  const opps = useApi<{ opportunities: DistributionOpportunity[] }>(
    withQuery("/api/marketing/distribution/opportunities", { session_id: sessionId }),
  );
  const [research, setResearch] = useState<{ source: string | null; note: string | null }>({
    source: null,
    note: null,
  });
  const [researchBusy, setResearchBusy] = useState(false);
  const [pauseSaving, setPauseSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paused = Boolean(config.autonomous_paused);

  async function togglePause() {
    setPauseSaving(true);
    setError(null);
    try {
      const res = await api.patch<{ config: DistributionCampaignConfig }>(
        "/api/marketing/distribution/setup",
        { session_id: sessionId, autonomous_paused: !paused },
      );
      onConfigChange(res.config);
    } catch (err) {
      setError(errorMessage(err, "Could not change the distribution pause"));
    } finally {
      setPauseSaving(false);
    }
  }

  async function runResearch() {
    setResearchBusy(true);
    setError(null);
    try {
      const res = await api.post<ResearchResult>("/api/marketing/distribution/opportunities", {
        session_id: sessionId,
        action: "research",
      });
      setResearch({ source: res.source, note: res.note });
      opps.reload();
    } catch (err) {
      setError(errorMessage(err, "Research failed"));
    } finally {
      setResearchBusy(false);
    }
  }

  return (
    <div>
      <CapabilityBanner />
      <div className="section-head">
        <div>
          <p className="label-caps">Distribution</p>
          <p className="fine-print">
            Goal: {config.goal.replace("_", " ")}
            {config.angle ? ` · ${config.angle.slice(0, 80)}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="btn-outline"
          aria-pressed={paused}
          onClick={togglePause}
          disabled={pauseSaving}
        >
          {pauseSaving ? "Saving…" : paused ? "Resume distribution" : "Pause distribution"}
        </button>
      </div>
      {paused && (
        <p className="paused-banner">Distribution is paused — research and posting are off.</p>
      )}
      {(error ?? opps.error) && (
        <p role="alert" className="form-error">
          {error ?? opps.error}
        </p>
      )}
      <hr className="crease" />

      {opps.loading && !opps.data ? (
        <p className="fine-print">Loading opportunities…</p>
      ) : (
        <OpportunityQueue
          opportunities={opps.data?.opportunities ?? []}
          sessionDbId={sessionId}
          researchNote={research.note}
          researchSource={research.source}
          busy={researchBusy}
          onRefresh={opps.reload}
          onResearch={runResearch}
        />
      )}

      <details className="advanced-disclosure">
        <summary>More — Advanced CRM (later feature)</summary>
        <p>
          Cold DM / creator CRM is preserved but not the primary Marketing product. Open only if you
          know what you&apos;re doing.
        </p>
        <button type="button" className="btn-outline" onClick={onOpenAdvanced}>
          Open Advanced CRM
        </button>
      </details>
    </div>
  );
}

function AdvancedCrm({
  sessionId,
  config,
  dossierTone,
  onSetup,
  onBack,
}: {
  sessionId: string;
  config: MarketingConfig | null;
  dossierTone?: string[];
  onSetup: (config: MarketingConfig) => void;
  onBack: () => void;
}) {
  const [editingSettings, setEditingSettings] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<"all" | "x" | "instagram">("all");
  const crm = useApi<{ entries: MarketingCrmEntry[] }>(
    withQuery("/api/marketing/crm", { session_id: sessionId }),
  );
  const conversations = useApi<{ conversations: Conversation[] }>(
    withQuery("/api/marketing/conversations", { session_id: sessionId }),
  );

  const back = (
    <button type="button" className="link-button mono" onClick={onBack}>
      ← Back to distribution
    </button>
  );

  if (!config || editingSettings) {
    return (
      <div>
        {back}
        <MarketingSetup
          sessionDbId={sessionId}
          existingTone={dossierTone}
          onComplete={(c) => {
            onSetup(c);
            setEditingSettings(false);
          }}
        />
      </div>
    );
  }

  const entries = crm.data?.entries ?? [];
  const filtered =
    platformFilter === "all" ? entries : entries.filter((e) => e.platform === platformFilter);
  const loadError = crm.error ?? conversations.error;

  return (
    <div>
      {back}
      <p className="fine-print">
        Advanced · X/IG CRM &amp; cold DMs (later feature — not the default Marketing loop)
      </p>
      {loadError && (
        <p role="alert" className="form-error">
          {loadError}
        </p>
      )}
      {crm.loading && !crm.data && <p className="fine-print">Loading CRM…</p>}
      <div className="dashboard-grid">
        <PlatformRail
          config={config}
          entries={entries}
          activeFilter={platformFilter}
          onFilter={setPlatformFilter}
          onOpenSettings={() => setEditingSettings(true)}
        />
        <MarketingCRM
          entries={filtered}
          config={config}
          sessionDbId={sessionId}
          paused={Boolean(config.autonomous_paused)}
          onRefresh={() => {
            crm.reload();
            conversations.reload();
          }}
        />
        <ConversationsPanel
          conversations={conversations.data?.conversations ?? []}
          entries={entries}
          onRefresh={conversations.reload}
        />
      </div>
    </div>
  );
}
