"use client";

import { useEffect, useRef, useState } from "react";
import Callout from "@/components/ui/Callout";
import Skeleton from "@/components/ui/Skeleton";
import { api, errorMessage } from "@/lib/client/api";
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

/** No usable plan yet: neither a proposed nor an approved one with an angle. */
function needsRecommendation(c: DistributionCampaignConfig | null | undefined): boolean {
  return !(c?.angle && (c.status === "proposed" || c.status === "approved"));
}

export default function DistributionSetup({
  sessionDbId,
  initialConfig,
  onComplete,
}: DistributionSetupProps) {
  const [config, setConfig] = useState<DistributionCampaignConfig | null>(initialConfig ?? null);
  const [source, setSource] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(
    () => Boolean(sessionDbId) && needsRecommendation(initialConfig),
  );
  const [error, setError] = useState<string | null>(null);
  const [reviseNote, setReviseNote] = useState("");

  const [goalLabel, setGoalLabel] = useState(
    initialConfig ? initialConfig.goal_label || initialConfig.goal.replace(/_/g, " ") : "",
  );
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

  /** Ask the strategist for a plan; state is updated only from the promise callbacks. */
  function requestRecommendation(sessionId: string, withRevise?: string) {
    return api
      .post<{
        config: DistributionCampaignConfig;
        source?: string;
        note?: string | null;
      }>("/api/marketing/distribution/setup", {
        session_id: sessionId,
        action: "recommend",
        ...(withRevise?.trim() ? { revise_note: withRevise.trim() } : {}),
      })
      .then((json) => {
        applyConfig(json.config, { source: json.source, note: json.note });
        setReviseNote("");
      })
      .catch((err) => setError(errorMessage(err, "Could not get a recommendation")))
      .finally(() => setBusy(false));
  }

  function recommend(withRevise?: string) {
    if (!sessionDbId) return;
    setBusy(true);
    setError(null);
    void requestRecommendation(sessionDbId, withRevise);
  }

  // Recommend at most once per session, even when effects run twice (Strict Mode).
  // `busy` already starts true when this first recommendation is due.
  const requestedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionDbId || requestedFor.current === sessionDbId) return;
    requestedFor.current = sessionDbId;
    if (initialConfig?.status === "approved" && initialConfig.angle) {
      onComplete(initialConfig);
      return;
    }
    if (needsRecommendation(initialConfig)) void requestRecommendation(sessionDbId);
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
      const json = await api.post<{ config: DistributionCampaignConfig }>(
        "/api/marketing/distribution/setup",
        {
          session_id: sessionDbId,
          action: "approve",
          goal: config.goal,
          goal_label: goalLabel.trim(),
          angle: angle.trim(),
          surfaces,
          rationale: rationale.trim(),
          why_these_surfaces: whySurfaces.trim(),
        },
      );
      onComplete(json.config);
    } catch (err) {
      setError(errorMessage(err, "Could not approve plan"));
    } finally {
      setBusy(false);
    }
  }

  if (!config && busy) {
    return (
      <div className="kraft-card distribution-setup" role="status" aria-busy="true">
        <p className="label-caps">Create distribution</p>
        <p className="mono meta-line">Recommending a plan from your dossier…</p>
        <Skeleton lines={4} title />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="kraft-card distribution-setup">
        <p className="label-caps">Create distribution</p>
        {error && <Callout tone="error">{error}</Callout>}
        <div className="actions">
          <button
            type="button"
            className="hanko-btn"
            onClick={() => recommend()}
            disabled={busy || !sessionDbId}
          >
            Recommend a plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="kraft-card distribution-setup distribution-setup--plan unfold">
      <p className="label-caps">Confirm distribution plan</p>
      <p className="sales-intro">
        {source === "fallback"
          ? "A starter plan built from your dossier. Edit anything, then approve before Kami researches opportunities."
          : "Kami's recommended next move for your company. Edit anything, then approve before Kami researches opportunities."}
      </p>
      {note && <p className="mono meta-line">{note}</p>}

      <div className="form-stack">
        <div className="form-line">
          <label className="mono label-caps" htmlFor="dist-goal">
            Job (plain English)
          </label>
          <input id="dist-goal" value={goalLabel} onChange={(e) => setGoalLabel(e.target.value)} />
        </div>

        <div className="form-line">
          <label className="mono label-caps" htmlFor="dist-angle">
            Campaign angle
          </label>
          <textarea
            id="dist-angle"
            className="sales-textarea sales-textarea--compact"
            rows={3}
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
          />
        </div>

        <div className="form-line">
          <span className="mono label-caps" id="dist-surfaces">
            Surfaces (max 3)
          </span>
          <div className="chip-row" role="group" aria-labelledby="dist-surfaces">
            {DISTRIBUTION_PLATFORMS.map((p) => {
              const on = surfaces.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  className="chip-toggle"
                  aria-pressed={on}
                  disabled={!on && surfaces.length >= 3}
                  onClick={() => toggleSurface(p)}
                >
                  <span className="chip-toggle__mark" aria-hidden="true">
                    {on ? "✓" : "·"}
                  </span>
                  {PLATFORM_LABELS[p]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="form-line">
          <label className="mono label-caps" htmlFor="dist-rationale">
            Why this plan
          </label>
          <textarea
            id="dist-rationale"
            className="sales-textarea sales-textarea--compact"
            rows={2}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
        </div>

        <div className="form-line">
          <label className="mono label-caps" htmlFor="dist-why-surfaces">
            Why these surfaces
          </label>
          <textarea
            id="dist-why-surfaces"
            className="sales-textarea sales-textarea--compact"
            rows={2}
            value={whySurfaces}
            onChange={(e) => setWhySurfaces(e.target.value)}
          />
        </div>
      </div>

      {error && <Callout tone="error">{error}</Callout>}

      <div className="actions distribution-setup__approve">
        <button
          type="button"
          className="hanko-btn"
          onClick={approve}
          disabled={busy || !sessionDbId}
        >
          {busy ? "Saving…" : "Approve plan"}
        </button>
      </div>

      <hr className="crease" />
      <div className="form-line">
        <label className="mono label-caps" htmlFor="dist-revise">
          Not right? Tell Kami what to change.
        </label>
        <textarea
          id="dist-revise"
          className="sales-textarea sales-textarea--compact"
          rows={2}
          value={reviseNote}
          onChange={(e) => setReviseNote(e.target.value)}
          placeholder="e.g. Focus on Product Hunt launch this month"
        />
      </div>
      <div className="actions">
        <button
          type="button"
          className="btn-outline mono"
          onClick={() => recommend(reviseNote)}
          disabled={busy || !sessionDbId}
        >
          {busy ? "Rethinking…" : "Try another"}
        </button>
      </div>
    </div>
  );
}
