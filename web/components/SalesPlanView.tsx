"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { SalesPlan } from "@/lib/salesTypes";
import type { SalesSegment } from "@/lib/domain/segments";
import { channelLabel, motionLabel } from "@/lib/salesMotionLabels";
import SalesFunnel from "@/components/SalesFunnel";

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
      <p className="mono" style={{ color: "var(--ink-soft)", padding: "var(--stack-md) 0" }}>
        Building your plan… if this persists, confirm ICP segments again.
      </p>
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

  const statusColor = plan.status === "approved" ? "var(--hanko)" : "var(--ink-soft)";

  return (
    <div
      className="kraft-card"
      style={{ padding: "var(--stack-md)", marginBottom: "var(--stack-md)" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "var(--stack-sm)",
        }}
      >
        <p className="label-caps">Your outbound plan</p>
        <span
          className="mono"
          style={{ color: statusColor, textTransform: "uppercase", fontSize: 12 }}
        >
          {plan.status === "approved" ? "Approved" : "Draft"}
        </span>
      </div>

      <p className="sales-intro" style={{ marginBottom: "var(--stack-sm)" }}>
        Research matching companies, draft emails, pause for your OK before anything sends.
      </p>

      {summaryParts.length > 0 && (
        <p style={{ fontSize: 15, marginBottom: "var(--stack-sm)" }}>
          <strong>{summaryParts.join(" · ")}</strong>
        </p>
      )}

      {planSource === "offline_fallback" && (
        <p
          className="mono"
          style={{
            fontSize: 12,
            color: "var(--hanko)",
            border: "1px solid var(--hanko)",
            padding: "0.5rem 0.75rem",
            marginBottom: "var(--stack-sm)",
          }}
        >
          Hermes unavailable — offline template plan.
          {planNote ? ` ${planNote}` : ""} Start Hermes and regenerate.
        </p>
      )}

      {offer && (
        <p
          className="mono"
          style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: "var(--stack-sm)" }}
        >
          Selling: {offer.slice(0, 160)}
          {offer.length > 160 ? "…" : ""}
        </p>
      )}

      <SalesFunnel segments={segments} plan={plan} />

      <details style={{ marginBottom: "var(--stack-sm)" }}>
        <summary className="mono" style={{ cursor: "pointer", fontSize: 12 }}>
          Motions, tiers &amp; risks
        </summary>
        <div style={{ marginTop: "0.75rem" }}>
          <p style={{ marginBottom: "var(--stack-sm)", fontSize: 14 }}>{plan.channel_rationale}</p>
          <ul style={{ marginBottom: "var(--stack-sm)", paddingLeft: "1.2rem" }}>
            {plan.motions.map((m, i) => (
              <li key={i} style={{ fontSize: 13 }}>
                <strong>{motionLabel(m.motion)}</strong> via {channelLabel(m.primary_channel)} —{" "}
                {m.rationale}
              </li>
            ))}
          </ul>
          <div
            style={{
              display: "flex",
              gap: "var(--stack-sm)",
              flexWrap: "wrap",
              marginBottom: "var(--stack-sm)",
            }}
          >
            {plan.tiers.map((t) => (
              <div
                key={t.tier}
                style={{
                  border: "1px solid var(--outline)",
                  padding: "0.5rem",
                  flex: "1 1 140px",
                  fontSize: 12,
                }}
              >
                <strong>{t.label}</strong>
                <p style={{ color: "var(--ink-soft)", margin: "0.25rem 0" }}>{t.criteria}</p>
                <p className="mono">
                  {t.target_count} · {t.channels.map(channelLabel).join(", ")}
                </p>
              </div>
            ))}
          </div>
          {plan.risks?.length ? (
            <ul style={{ fontSize: 12, paddingLeft: "1.2rem", marginBottom: 0 }}>
              {plan.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>

      {plan.status === "draft" && (
        <div style={{ marginTop: "var(--stack-md)" }}>
          <div className="form-line" style={{ marginBottom: "var(--stack-sm)" }}>
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
          <div style={{ display: "flex", gap: "var(--stack-sm)" }}>
            <button className="hanko-btn" onClick={approve} disabled={busy || !plan.id}>
              {busy ? "…" : "Approve plan"}
            </button>
            <button type="button" className="btn-secondary" onClick={revise} disabled={busy}>
              Regenerate with note
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {plan.status === "approved" && (
        <p
          className="mono"
          style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: "var(--stack-sm)" }}
        >
          Plan approved — continue to Find companies.
        </p>
      )}
    </div>
  );
}
