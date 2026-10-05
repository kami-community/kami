"use client";

import { useState } from "react";
import type { MarketingConfig, MarketingCrmEntry } from "@/lib/marketingTypes";
import { api, errorMessage } from "@/lib/client/api";
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

interface DiscoverResponse {
  message: string;
  warnings: string[];
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
  const [subTab, setSubTab] = useState<CrmSubTab>(hasX ? "x_outreach" : "creators");
  const [busy, setBusy] = useState<"discover" | "outreach" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leads = entries.filter((e) => e.type === "x_lead");
  const creators = entries.filter((e) => e.type === "creator");

  /** Approve each entry (X leads only) and send its first DM; stops at the first failure. */
  async function sendOutreach(ids: string[], platformLabel: string, approveFirst: boolean) {
    if (!sessionDbId || busy) return;
    setBusy("outreach");
    setMessage(null);
    setError(null);
    let sent = 0;
    try {
      for (const id of ids) {
        if (approveFirst) {
          await api.post("/api/marketing/crm", { session_id: sessionDbId, id, status: "approved" });
        }
        await api.post("/api/marketing/dm", { session_id: sessionDbId, crm_entry_id: id });
        sent++;
      }
      setMessage(`Sent ${sent} ${platformLabel} outreach DM(s) from your connected account.`);
    } catch (err) {
      setError(
        `${errorMessage(err, "DM failed")}${sent ? ` (${sent} sent before the failure)` : ""}`,
      );
    } finally {
      setBusy(null);
      onRefresh();
    }
  }

  async function triggerDiscovery() {
    if (paused || busy || !sessionDbId) return;
    setBusy("discover");
    setMessage(null);
    setError(null);
    try {
      const res = await api.post<DiscoverResponse>("/api/marketing/discover", {
        session_id: sessionDbId,
      });
      setMessage(res.message + (res.warnings.length ? ` (${res.warnings[0]})` : ""));
      onRefresh();
    } catch (err) {
      setError(errorMessage(err, "Discovery failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="section-head">
        {hasX && hasIg && (
          <div className="tab-row" role="tablist">
            <button
              type="button"
              role="tab"
              className="campaign-tab"
              aria-selected={subTab === "x_outreach"}
              data-active={subTab === "x_outreach"}
              onClick={() => setSubTab("x_outreach")}
            >
              X Outreach
            </button>
            <button
              type="button"
              role="tab"
              className="campaign-tab"
              aria-selected={subTab === "creators"}
              data-active={subTab === "creators"}
              onClick={() => setSubTab("creators")}
            >
              Creators
            </button>
          </div>
        )}
        <button
          type="button"
          className="btn-outline"
          onClick={triggerDiscovery}
          disabled={paused || busy !== null || !sessionDbId}
        >
          {busy === "discover" ? "Discovering…" : "Run discovery"}
        </button>
      </div>
      {paused && <p className="paused-banner">Marketing is paused — resume to run discovery.</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p className="fine-print" aria-live="polite">
          {message}
        </p>
      )}
      <hr className="crease" />

      {subTab === "x_outreach" && hasX && (
        <>
          <BoostManager sessionDbId={sessionDbId} />
          <hr className="crease" />
          <p className="label-caps">Cold Outreach</p>
          <LeadTable
            leads={leads}
            busy={busy === "outreach"}
            disabled={paused}
            onApprove={(ids) => void sendOutreach(ids, "X", true)}
          />
        </>
      )}

      {subTab === "creators" && hasIg && (
        <CreatorTable
          creators={creators}
          busy={busy === "outreach"}
          disabled={paused}
          onApproveOutreach={(ids) => void sendOutreach(ids, "Instagram", false)}
        />
      )}
    </div>
  );
}
