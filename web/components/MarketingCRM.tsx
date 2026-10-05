"use client";

import { useState } from "react";
import type { MarketingConfig, MarketingCrmEntry } from "@/lib/marketingTypes";
import BoostManager from "@/components/BoostManager";
import LeadTable from "@/components/LeadTable";
import CreatorTable from "@/components/CreatorTable";

type CrmSubTab = "x_outreach" | "creators";

interface MarketingCRMProps {
  entries: MarketingCrmEntry[];
  config: MarketingConfig;
  sessionDbId: string | null;
  paused?: boolean;
  onRefresh: () => void;
}

export default function MarketingCRM({
  entries,
  config,
  sessionDbId,
  paused,
  onRefresh,
}: MarketingCRMProps) {
  const hasX = config.platforms.includes("x");
  const hasIg = config.platforms.includes("instagram");
  const defaultTab: CrmSubTab = hasX ? "x_outreach" : "creators";
  const [subTab, setSubTab] = useState<CrmSubTab>(defaultTab);
  const [discovering, setDiscovering] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState<string | null>(null);

  const leads = entries.filter((e) => e.type === "x_lead");
  const creators = entries.filter((e) => e.type === "creator");

  async function approveLeads(ids: string[]) {
    if (!sessionDbId) return;
    const errors: string[] = [];
    for (const id of ids) {
      await fetch("/api/marketing/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "approved" }),
      });
      const dm = await fetch("/api/marketing/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionDbId, crm_entry_id: id }),
      });
      if (!dm.ok) {
        const j = await dm.json().catch(() => ({}));
        errors.push((j as { error?: string }).error ?? `DM failed for ${id}`);
      }
    }
    if (errors.length) setDiscoverMsg(errors[0]);
    else setDiscoverMsg(`Sent ${ids.length} X outreach DM(s) from your connected account.`);
    onRefresh();
  }

  async function approveCreatorOutreach(ids: string[]) {
    if (!sessionDbId) return;
    const errors: string[] = [];
    for (const id of ids) {
      const dm = await fetch("/api/marketing/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionDbId, crm_entry_id: id }),
      });
      if (!dm.ok) {
        const j = await dm.json().catch(() => ({}));
        errors.push((j as { error?: string }).error ?? `DM failed for ${id}`);
      }
    }
    if (errors.length) setDiscoverMsg(errors[0]);
    else setDiscoverMsg(`Sent ${ids.length} Instagram outreach DM(s) from your connected account.`);
    onRefresh();
  }

  async function triggerDiscovery() {
    if (paused || discovering || !sessionDbId) return;
    setDiscovering(true);
    setDiscoverMsg(null);
    try {
      const res = await fetch("/api/marketing/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionDbId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        paused?: boolean;
        created?: number;
        updated?: number;
        warnings?: string[];
      };
      if (res.status === 423) {
        setDiscoverMsg("Marketing is paused — resume to run discovery.");
        return;
      }
      if (!res.ok) {
        setDiscoverMsg(json.error ?? json.message ?? `Discovery failed (${res.status})`);
        return;
      }
      const warn = json.warnings?.length ? ` (${json.warnings[0]})` : "";
      setDiscoverMsg((json.message ?? "Discovery complete.") + warn);
      onRefresh();
    } catch (e) {
      setDiscoverMsg(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--stack-sm)",
        }}
      >
        {hasX && hasIg && (
          <div style={{ display: "flex", gap: "0" }}>
            <button
              type="button"
              className="campaign-tab"
              data-active={subTab === "x_outreach"}
              onClick={() => setSubTab("x_outreach")}
            >
              X Outreach
            </button>
            <button
              type="button"
              className="campaign-tab"
              data-active={subTab === "creators"}
              onClick={() => setSubTab("creators")}
            >
              Creators
            </button>
          </div>
        )}
        <button
          className="mono"
          onClick={triggerDiscovery}
          disabled={paused || discovering || !sessionDbId}
          style={{
            border: "1px solid var(--ink)",
            background: "transparent",
            padding: "0.3rem 0.7rem",
            cursor: paused || discovering || !sessionDbId ? "not-allowed" : "pointer",
            opacity: paused || discovering || !sessionDbId ? 0.5 : 1,
          }}
        >
          {discovering ? "Discovering…" : "Run discovery"}
        </button>
      </div>
      {discoverMsg && (
        <p
          className="mono"
          style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: "var(--stack-sm)" }}
        >
          {discoverMsg}
        </p>
      )}
      <hr className="crease" />

      {subTab === "x_outreach" && hasX && (
        <>
          <BoostManager sessionDbId={sessionDbId} />
          <hr className="crease" />
          <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
            Cold Outreach
          </p>
          <LeadTable leads={leads} onApprove={approveLeads} />
        </>
      )}

      {subTab === "creators" && hasIg && (
        <CreatorTable creators={creators} onApproveOutreach={approveCreatorOutreach} />
      )}
    </div>
  );
}
