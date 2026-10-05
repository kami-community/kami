"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { Dossier } from "@/lib/domain/dossier";
import {
  configToNlPrefill,
  dossierToNlPrefill,
  nlPrefillToConfig,
  salesWhoLabel,
  type SalesNlPrefill,
} from "@/lib/salesDossierPrefill";
import type { SalesCampaignConfig, SalesChannel } from "@/lib/salesTypes";

interface SalesSetupProps {
  sessionDbId: string | null;
  dossier: Dossier | null;
  domain: string;
  existingConfig?: SalesCampaignConfig | null;
  goals?: string[];
  onComplete: (config: SalesCampaignConfig, planGenerated: boolean) => void;
}

const QTY_OPTIONS = [10, 15, 25] as const;

export default function SalesSetup({
  sessionDbId,
  dossier,
  domain,
  existingConfig,
  goals,
  onComplete,
}: SalesSetupProps) {
  // Prefill once on mount; the parent remounts (via `key`) when the source changes.
  const [initial] = useState(() =>
    existingConfig
      ? configToNlPrefill(existingConfig)
      : dossierToNlPrefill(dossier, domain, null, goals),
  );

  const [whoSentence, setWhoSentence] = useState(initial.whoSentence);
  const [whatSentence, setWhatSentence] = useState(initial.whatSentence);
  const [targetQty, setTargetQty] = useState(initial.targetQty);
  const [showDetails, setShowDetails] = useState(false);
  const [icpTitles, setIcpTitles] = useState(initial.icpTitles);
  const [icpIndustries, setIcpIndustries] = useState(initial.icpIndustries);
  const [geo, setGeo] = useState(initial.geo);
  const [exclusions, setExclusions] = useState("");
  const [dailyCap, setDailyCap] = useState(existingConfig?.daily_send_cap ?? 35);
  const [autoFollowups, setAutoFollowups] = useState(
    existingConfig?.autonomy?.auto_followups ?? false,
  );
  const [requireFirstSendApproval, setRequireFirstSendApproval] = useState(
    existingConfig?.autonomy?.require_first_send_approval ?? true,
  );
  const [channels] = useState<SalesChannel[]>(existingConfig?.allowed_channels ?? ["email"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!sessionDbId || !whatSentence.trim()) return;
    setSaving(true);
    setError(null);

    const prefill: SalesNlPrefill = {
      whoSentence,
      whatSentence,
      targetQty,
      icpTitles,
      icpIndustries,
      geo,
      offer: whatSentence.slice(0, 280),
      positioningLine: whatSentence.slice(0, 140),
    };

    const payload = nlPrefillToConfig(sessionDbId, prefill, {
      exclusions,
      dealMin: existingConfig?.deal_range?.min != null ? String(existingConfig.deal_range.min) : "",
      dealMax: existingConfig?.deal_range?.max != null ? String(existingConfig.deal_range.max) : "",
      dailyCap,
      senderName: existingConfig?.sender_identity?.name ?? "",
      senderEmail: existingConfig?.sender_identity?.email ?? "",
      autoFollowups,
      requireFirstSendApproval,
      channels,
    });

    try {
      const { config } = await api.post<{ config: SalesCampaignConfig }>(
        "/api/sales/setup",
        payload,
      );
      // Plan is generated after ICP segments are confirmed (failsafe).
      onComplete(config, false);
    } catch (err) {
      setError(errorMessage(err, "Could not save the sales setup"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sales-panel" style={{ paddingTop: "var(--stack-md)" }}>
      <h3 style={{ marginBottom: "var(--stack-sm)" }}>Confirm who and what</h3>
      <p className="sales-intro">
        We filled this from your company research. Edit anything that looks wrong, then confirm your
        ICP segments.
      </p>

      {!sessionDbId && (
        <p className="mono" style={{ color: "var(--hanko)", marginBottom: "var(--stack-md)" }}>
          Waiting for session — launch a campaign first.
        </p>
      )}

      <div className="form-line" style={{ marginBottom: "var(--stack-md)" }}>
        <label className="mono label-caps" htmlFor="who-sentence">
          {salesWhoLabel(goals)}
        </label>
        <textarea
          id="who-sentence"
          className="sales-textarea"
          value={whoSentence}
          onChange={(e) => setWhoSentence(e.target.value)}
        />
      </div>

      <div className="form-line" style={{ marginBottom: "var(--stack-md)" }}>
        <label className="mono label-caps" htmlFor="what-sentence">
          What should we say you help with?
        </label>
        <textarea
          id="what-sentence"
          className="sales-textarea"
          value={whatSentence}
          onChange={(e) => setWhatSentence(e.target.value)}
        />
      </div>

      <div className="form-line" style={{ marginBottom: "var(--stack-md)" }}>
        <label className="mono label-caps">How many companies should we research first?</label>
        <div className="sales-qty-chips">
          {QTY_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              className="sales-qty-chip"
              data-active={targetQty === n}
              onClick={() => setTargetQty(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="mono"
        onClick={() => setShowDetails(!showDetails)}
        style={{
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
          textDecoration: "underline",
          fontSize: 12,
          marginBottom: "var(--stack-md)",
        }}
      >
        {showDetails ? "Hide details" : "Edit details"}
      </button>

      {showDetails && (
        <div
          style={{
            display: "flex",
            gap: "var(--stack-md)",
            flexWrap: "wrap",
            marginBottom: "var(--stack-md)",
          }}
        >
          <div className="form-line" style={{ flex: 1, minWidth: 180 }}>
            <label className="mono label-caps" htmlFor="icp-titles">
              Titles
            </label>
            <input
              id="icp-titles"
              value={icpTitles}
              onChange={(e) => setIcpTitles(e.target.value)}
            />
          </div>
          <div className="form-line" style={{ flex: 1, minWidth: 180 }}>
            <label className="mono label-caps" htmlFor="icp-industries">
              Industries
            </label>
            <input
              id="icp-industries"
              value={icpIndustries}
              onChange={(e) => setIcpIndustries(e.target.value)}
            />
          </div>
          <div className="form-line" style={{ flex: 1, minWidth: 120 }}>
            <label className="mono label-caps" htmlFor="geo">
              Geography
            </label>
            <input
              id="geo"
              value={geo}
              onChange={(e) => setGeo(e.target.value)}
              placeholder="US, UK"
            />
          </div>
        </div>
      )}

      <details className="sales-disclosure" style={{ marginBottom: "var(--stack-lg)" }}>
        <summary>Advanced</summary>
        <div style={{ paddingTop: "var(--stack-sm)" }}>
          <div className="form-line" style={{ marginBottom: "var(--stack-sm)" }}>
            <label className="mono label-caps" htmlFor="exclusions">
              Exclusions (one per line)
            </label>
            <textarea
              id="exclusions"
              className="sales-textarea"
              rows={2}
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
            />
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>
              Domains or company names to skip during Find.
            </p>
          </div>
          <div className="form-line" style={{ marginBottom: "var(--stack-sm)", maxWidth: 200 }}>
            <label className="mono label-caps" htmlFor="daily-cap">
              Daily send cap
            </label>
            <input
              id="daily-cap"
              type="number"
              min={1}
              value={dailyCap}
              onChange={(e) => setDailyCap(Number(e.target.value))}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <button
              type="button"
              className="mono"
              onClick={() => setRequireFirstSendApproval(!requireFirstSendApproval)}
              style={{
                background: requireFirstSendApproval ? "var(--kraft)" : "transparent",
                border: "1px solid var(--ink)",
                padding: "0.4rem 0.75rem",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {requireFirstSendApproval ? "✓" : "·"} Require approval before first send
            </button>
            <button
              type="button"
              className="mono"
              onClick={() => setAutoFollowups(!autoFollowups)}
              style={{
                background: autoFollowups ? "var(--kraft)" : "transparent",
                border: "1px solid var(--ink)",
                padding: "0.4rem 0.75rem",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {autoFollowups ? "✓" : "·"} Plan follow-ups in sequences
            </button>
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
              Follow-ups stay in the sequence plan — approval and send gates still apply. Does not
              auto-send.
            </p>
          </div>
        </div>
      </details>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button
        className="hanko-btn"
        onClick={submit}
        disabled={!sessionDbId || !whatSentence.trim() || saving}
      >
        {saving ? "Saving…" : "Looks good — show plan"}
      </button>
    </div>
  );
}
