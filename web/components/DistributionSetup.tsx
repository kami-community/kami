"use client";

import { useEffect, useState } from "react";
import {
  DISTRIBUTION_PLATFORMS,
  type DistributionCampaignConfig,
  type DistributionPlatform,
} from "@/lib/distributionTypes";

interface DistributionSetupProps {
  sessionDbId: string | null;
  /** Existing proposed/partial plan from GET, if any. */
  initialConfig?: DistributionCampaignConfig | null;
  onComplete: (config: DistributionCampaignConfig) => void;
}

const PLATFORM_LABELS: Record<DistributionPlatform, string> = {
  x: "X",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  hackernews: "Hacker News",
  producthunt: "Product Hunt",
  discord: "Discord",
};

export default function DistributionSetup({
  sessionDbId,
  initialConfig,
  onComplete,
}: DistributionSetupProps) {
  const [config, setConfig] = useState<DistributionCampaignConfig | null>(initialConfig ?? null);
  const [source, setSource] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviseNote, setReviseNote] = useState("");

  const [goalLabel, setGoalLabel] = useState(initialConfig?.goal_label ?? "");
  const [angle, setAngle] = useState(initialConfig?.angle ?? "");
  const [surfaces, setSurfaces] = useState<DistributionPlatform[]>(
    initialConfig?.surfaces?.length ? initialConfig.surfaces : [],
  );
  const [rationale, setRationale] = useState(initialConfig?.rationale ?? "");
  const [whySurfaces, setWhySurfaces] = useState(initialConfig?.why_these_surfaces ?? "");

  function applyConfig(
    c: DistributionCampaignConfig,
    meta?: { source?: string; note?: string | null },
  ) {
    setConfig(c);
    setGoalLabel(c.goal_label || c.goal.replace(/_/g, " "));
    setAngle(c.angle ?? "");
    setSurfaces(c.surfaces?.length ? c.surfaces : []);
    setRationale(c.rationale ?? "");
    setWhySurfaces(c.why_these_surfaces ?? "");
    if (meta?.source) setSource(meta.source);
    if (meta?.note !== undefined) setNote(meta.note);
  }

  async function recommend(withRevise?: string) {
    if (!sessionDbId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/marketing/distribution/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionDbId,
          action: "recommend",
          ...(withRevise?.trim() ? { revise_note: withRevise.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.config) {
        setError(json.error ?? "Could not get a recommendation");
        return;
      }
      applyConfig(json.config as DistributionCampaignConfig, {
        source: json.source,
        note: json.note,
      });
      setReviseNote("");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!sessionDbId) return;
    if (initialConfig?.angle && initialConfig.status === "proposed") {
      applyConfig(initialConfig);
      return;
    }
    if (initialConfig?.status === "approved" && initialConfig.angle) {
      onComplete(initialConfig);
      return;
    }
    void recommend();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when session ready
  }, [sessionDbId]);

  function toggleSurface(p: DistributionPlatform) {
    setSurfaces((prev) => {
      if (prev.includes(p)) return prev.filter((x) => x !== p);
      if (prev.length >= 3) return prev;
      return [...prev, p];
    });
  }

  async function approve() {
    if (!sessionDbId || !config) return;
    if (!angle.trim() || !surfaces.length) {
      setError("Add an angle and at least one surface before approving.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/marketing/distribution/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionDbId,
          action: "approve",
          goal: config.goal,
          goal_label: goalLabel.trim(),
          angle: angle.trim(),
          surfaces,
          rationale: rationale.trim(),
          why_these_surfaces: whySurfaces.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.config) {
        setError(json.error ?? "Could not approve plan");
        return;
      }
      onComplete(json.config as DistributionCampaignConfig);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (!config && busy) {
    return (
      <div className="kraft-card" style={{ padding: "var(--stack-md)", maxWidth: 560 }}>
        <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
          Create distribution
        </p>
        <p className="mono" style={{ color: "var(--ink-soft)" }}>
          Hermes is recommending a plan from your dossier…
        </p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="kraft-card" style={{ padding: "var(--stack-md)", maxWidth: 560 }}>
        <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
          Create distribution
        </p>
        {error && (
          <p
            className="mono"
            style={{ color: "var(--hanko)", fontSize: 13, marginBottom: "0.5rem" }}
          >
            {error}
          </p>
        )}
        <button
          type="button"
          className="hanko-btn"
          onClick={() => recommend()}
          disabled={busy || !sessionDbId}
        >
          {busy ? "…" : "Get Hermes recommendation"}
        </button>
      </div>
    );
  }

  return (
    <div className="kraft-card" style={{ padding: "var(--stack-md)", maxWidth: 640 }}>
      <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
        Confirm distribution plan
      </p>
      <p className="sales-intro" style={{ marginBottom: "var(--stack-md)" }}>
        Hermes analyzed your company and recommends this next move. Edit anything, then approve
        before we research opportunities.
      </p>

      {(source || note) && (
        <p
          className="mono"
          style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: "var(--stack-sm)" }}
        >
          {source === "fallback" ? "Starter plan · " : "Hermes · "}
          {note || "Review before approving."}
        </p>
      )}

      <label className="mono" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
        Job (plain English)
      </label>
      <input
        value={goalLabel}
        onChange={(e) => setGoalLabel(e.target.value)}
        style={{
          width: "100%",
          marginBottom: "0.75rem",
          padding: "0.5rem",
          border: "1px solid var(--outline)",
          background: "var(--paper)",
          color: "var(--ink)",
          fontFamily: "var(--font-body)",
        }}
      />

      <label className="mono" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
        Campaign angle
      </label>
      <textarea
        value={angle}
        onChange={(e) => setAngle(e.target.value)}
        rows={3}
        style={{
          width: "100%",
          marginBottom: "0.75rem",
          padding: "0.5rem",
          border: "1px solid var(--outline)",
          background: "var(--paper)",
          color: "var(--ink)",
          fontFamily: "var(--font-body)",
        }}
      />

      <label className="mono" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
        Surfaces (max 3)
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.75rem" }}>
        {DISTRIBUTION_PLATFORMS.map((p) => {
          const on = surfaces.includes(p);
          return (
            <button
              key={p}
              type="button"
              className="mono"
              onClick={() => toggleSurface(p)}
              style={{
                fontSize: 12,
                border: on ? "1px solid var(--hanko)" : "1px solid var(--outline)",
                background: on ? "var(--kraft)" : "transparent",
                padding: "0.3rem 0.55rem",
                cursor: "pointer",
                color: "var(--ink)",
              }}
            >
              {PLATFORM_LABELS[p]}
            </button>
          );
        })}
      </div>

      <label className="mono" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
        Why this plan
      </label>
      <textarea
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        rows={2}
        style={{
          width: "100%",
          marginBottom: "0.75rem",
          padding: "0.5rem",
          border: "1px solid var(--outline)",
          background: "var(--paper)",
          color: "var(--ink)",
          fontFamily: "var(--font-body)",
        }}
      />

      <label className="mono" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
        Why these surfaces
      </label>
      <textarea
        value={whySurfaces}
        onChange={(e) => setWhySurfaces(e.target.value)}
        rows={2}
        style={{
          width: "100%",
          marginBottom: "var(--stack-md)",
          padding: "0.5rem",
          border: "1px solid var(--outline)",
          background: "var(--paper)",
          color: "var(--ink)",
          fontFamily: "var(--font-body)",
        }}
      />

      {error && (
        <p className="mono" style={{ color: "var(--hanko)", fontSize: 13, marginBottom: "0.5rem" }}>
          {error}
        </p>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "var(--stack-md)",
        }}
      >
        <button
          type="button"
          className="hanko-btn"
          onClick={approve}
          disabled={busy || !sessionDbId}
        >
          {busy ? "…" : "Approve plan"}
        </button>
      </div>

      <hr className="crease" />
      <p
        className="mono"
        style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: "var(--stack-sm)" }}
      >
        Not right? Tell Hermes what to change.
      </p>
      <textarea
        value={reviseNote}
        onChange={(e) => setReviseNote(e.target.value)}
        placeholder="e.g. Focus on Product Hunt launch this month"
        rows={2}
        style={{
          width: "100%",
          marginTop: "0.5rem",
          marginBottom: "0.5rem",
          padding: "0.5rem",
          border: "1px solid var(--outline)",
          background: "var(--paper)",
          color: "var(--ink)",
          fontFamily: "var(--font-body)",
        }}
      />
      <button
        type="button"
        className="mono"
        onClick={() => recommend(reviseNote)}
        disabled={busy || !sessionDbId}
        style={{
          border: "1px solid var(--ink)",
          background: "transparent",
          padding: "0.4rem 0.75rem",
          cursor: "pointer",
        }}
      >
        {busy ? "…" : "Try another"}
      </button>
    </div>
  );
}
