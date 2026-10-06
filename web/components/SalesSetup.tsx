"use client";

import { useState } from "react";
import Callout from "@/components/ui/Callout";
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
    <div className="sales-panel sales-setup form-stack unfold">
      <h3>Confirm who and what</h3>
      <p className="sales-intro">
        We filled this from your company research. Edit anything that looks wrong, then confirm your
        ICP segments.
      </p>

      {!sessionDbId && (
        <Callout tone="warn">Waiting for session — launch a campaign first.</Callout>
      )}

      <div className="form-line">
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

      <div className="form-line">
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

      <div className="form-line">
        <span className="mono label-caps" id="qty-label">
          How many companies should we research first?
        </span>
        <div className="sales-qty-chips" role="group" aria-labelledby="qty-label">
          {QTY_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              className="sales-qty-chip"
              data-active={targetQty === n}
              aria-pressed={targetQty === n}
              onClick={() => setTargetQty(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          className="link-button mono"
          aria-expanded={showDetails}
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? "Hide details" : "Edit details"}
        </button>
      </div>

      {showDetails && (
        <div className="inline-form unfold">
          <div className="form-line">
            <label className="mono label-caps" htmlFor="icp-titles">
              Titles
            </label>
            <input
              id="icp-titles"
              value={icpTitles}
              onChange={(e) => setIcpTitles(e.target.value)}
            />
          </div>
          <div className="form-line">
            <label className="mono label-caps" htmlFor="icp-industries">
              Industries
            </label>
            <input
              id="icp-industries"
              value={icpIndustries}
              onChange={(e) => setIcpIndustries(e.target.value)}
            />
          </div>
          <div className="form-line">
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

      <details className="sales-disclosure">
        <summary>Advanced</summary>
        <div className="form-stack sales-setup__advanced">
          <div className="form-line">
            <label className="mono label-caps" htmlFor="exclusions">
              Exclusions (one per line)
            </label>
            <textarea
              id="exclusions"
              className="sales-textarea sales-textarea--compact"
              rows={2}
              value={exclusions}
              aria-describedby="exclusions-hint"
              onChange={(e) => setExclusions(e.target.value)}
            />
            <p id="exclusions-hint" className="mono fine-print">
              Domains or company names to skip during Find.
            </p>
          </div>
          <div className="form-line sales-setup__cap">
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
          <div className="card-list card-list--tight">
            <button
              type="button"
              className="chip-toggle sales-setup__toggle"
              aria-pressed={requireFirstSendApproval}
              onClick={() => setRequireFirstSendApproval(!requireFirstSendApproval)}
            >
              <span className="chip-toggle__mark" aria-hidden="true">
                {requireFirstSendApproval ? "✓" : "·"}
              </span>
              Require approval before first send
            </button>
            <button
              type="button"
              className="chip-toggle sales-setup__toggle"
              aria-pressed={autoFollowups}
              onClick={() => setAutoFollowups(!autoFollowups)}
            >
              <span className="chip-toggle__mark" aria-hidden="true">
                {autoFollowups ? "✓" : "·"}
              </span>
              Plan follow-ups in sequences
            </button>
            <p className="mono fine-print">
              Follow-ups stay in the sequence plan — approval and send gates still apply. Does not
              auto-send.
            </p>
          </div>
        </div>
      </details>

      {error && <Callout tone="error">{error}</Callout>}

      <div className="actions">
        <button
          type="button"
          className="hanko-btn"
          onClick={submit}
          disabled={!sessionDbId || !whatSentence.trim() || saving}
        >
          {saving ? "Saving…" : "Looks good — show plan"}
        </button>
      </div>
    </div>
  );
}
