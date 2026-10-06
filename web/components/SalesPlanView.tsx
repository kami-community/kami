"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { SalesPlan } from "@/lib/salesTypes";
import type { SalesSegment } from "@/lib/domain/segments";
import { channelLabel, motionLabel } from "@/lib/salesMotionLabels";
import SalesFunnel from "@/components/SalesFunnel";
import Callout from "@/components/ui/Callout";
import Seal from "@/components/ui/Seal";
import Skeleton from "@/components/ui/Skeleton";

interface SalesPlanViewProps {
  sessionDbId: string | null;
  plan: SalesPlan | null;
  offer?: string;
  segments?: SalesSegment[] | null;
  planSource?: "hermes" | "offline_fallback" | "client" | null;
  planNote?: string | null;
  onApproved: (plan: SalesPlan) => void;
  onRevised: (
    plan: SalesPlan,
    meta?: { source?: "hermes" | "offline_fallback" | "client"; note?: string | null },
  ) => void;
}

export default function SalesPlanView({
  sessionDbId,
  plan,
  offer,
  segments,
  planSource = null,
  planNote = null,
  onApproved,
  onRevised,
}: SalesPlanViewProps) {
  const [reviseNote, setReviseNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!plan) {
    return (
      <div className="kraft-card sales-plan" role="status" aria-busy="true">
        <p className="mono meta-line">
          Building your plan… if this persists, confirm ICP segments again.
        </p>
        <Skeleton lines={3} title />
      </div>
    );
  }

  const currentPlan = plan;
  const accounts = plan.estimated_activity?.accounts_to_research ?? null;
  const sends = plan.estimated_activity?.sends_per_week ?? null;
  const motionCount = plan.motions?.length ?? 0;
  const summaryParts = [
    accounts != null ? `~${accounts} companies` : null,
    sends != null ? `~${sends} emails/week` : null,
    motionCount ? `${motionCount} motion${motionCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  type PlanResponse = {
    plan: SalesPlan;
    source?: "hermes" | "offline_fallback" | "client";
    note?: string | null;
  };

  async function approve() {
    if (!sessionDbId || !currentPlan.id) return;
    setBusy(true);
    setError(null);
    try {
      const { plan: approved } = await api.post<PlanResponse>("/api/sales/plan", {
        session_id: sessionDbId,
        action: "approve",
        plan_id: currentPlan.id,
      });
      onApproved(approved);
    } catch (err) {
      setError(errorMessage(err, "Could not approve the plan"));
    } finally {
      setBusy(false);
    }
  }

  async function revise() {
    if (!sessionDbId) return;
    setBusy(true);
    setError(null);
    try {
      const json = await api.post<PlanResponse>("/api/sales/plan", {
        session_id: sessionDbId,
        action: "generate",
        revise_note: reviseNote.trim() || undefined,
      });
      setReviseNote("");
      onRevised(json.plan, { source: json.source, note: json.note ?? null });
    } catch (err) {
      setError(errorMessage(err, "Could not regenerate the plan"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kraft-card sales-plan unfold">
      <div className="section-head">
        <p className="label-caps">Your outbound plan</p>
        {plan.status === "approved" ? (
          <Seal tone="moss">Approved</Seal>
        ) : (
          <span className="tag">Draft</span>
        )}
      </div>

      <p className="sales-intro">
        Research matching companies, draft emails, pause for your OK before anything sends.
      </p>

      {summaryParts.length > 0 && (
        <p className="sales-plan__summary">
          <strong>{summaryParts.join(" · ")}</strong>
        </p>
      )}

      {planSource === "offline_fallback" && (
        <Callout tone="warn">
          Hermes unavailable — offline template plan.
          {planNote ? ` ${planNote}` : ""} Start Hermes and regenerate.
        </Callout>
      )}

      {offer && (
        <p className="mono meta-line">
          Selling: {offer.slice(0, 160)}
          {offer.length > 160 ? "…" : ""}
        </p>
      )}

      <SalesFunnel segments={segments} plan={plan} />

      <details className="sales-plan__details">
        <summary className="mono">Motions, tiers &amp; risks</summary>
        <div className="flow">
          <p>{plan.channel_rationale}</p>
          <ul className="sales-plan__list">
            {plan.motions.map((m, i) => (
              <li key={i}>
                <strong>{motionLabel(m.motion)}</strong> via {channelLabel(m.primary_channel)} —{" "}
                {m.rationale}
              </li>
            ))}
          </ul>
          <div className="sales-plan__tiers">
            {plan.tiers.map((t) => (
              <div key={t.tier} className="subcard sales-plan__tier">
                <strong>{t.label}</strong>
                <p>{t.criteria}</p>
                <p className="mono">
                  {t.target_count} · {t.channels.map(channelLabel).join(", ")}
                </p>
              </div>
            ))}
          </div>
          {plan.risks?.length ? (
            <ul className="sales-plan__list sales-plan__list--fine">
              {plan.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>

      {plan.status === "draft" && (
        <div className="form-stack">
          <div className="form-line">
            <label className="mono label-caps" htmlFor="revise-note">
              Want changes? (optional)
            </label>
            <input
              id="revise-note"
              value={reviseNote}
              onChange={(e) => setReviseNote(e.target.value)}
              placeholder="Focus on fintech only, fewer companies…"
            />
          </div>
          <div className="actions">
            <button
              type="button"
              className="hanko-btn"
              onClick={approve}
              disabled={busy || !plan.id}
            >
              {busy ? "Saving…" : "Approve plan"}
            </button>
            <button type="button" className="btn-secondary" onClick={revise} disabled={busy}>
              Regenerate with note
            </button>
          </div>
        </div>
      )}

      {error && <Callout tone="error">{error}</Callout>}

      {plan.status === "approved" && (
        <p className="mono meta-line">Plan approved — continue to Find companies.</p>
      )}
    </div>
  );
}
