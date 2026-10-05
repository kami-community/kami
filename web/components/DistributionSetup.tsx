"use client";

import { useState } from "react";
import {
  DISTRIBUTION_GOAL_LABELS,
  type DistributionCampaignConfig,
  type DistributionGoal,
} from "@/lib/distributionTypes";

interface DistributionSetupProps {
  sessionDbId: string | null;
  onComplete: (config: DistributionCampaignConfig) => void;
}

const GOALS: DistributionGoal[] = ["launch", "early_users", "credibility", "waitlist"];

const GOAL_HELP: Record<DistributionGoal, string> = {
  launch: "Prepare a coherent launch story and places to show up.",
  early_users: "Find conversations where people need what you built.",
  credibility: "Earn trust with useful founder insights.",
  waitlist: "Create curiosity and collect early interest.",
};

export default function DistributionSetup({ sessionDbId, onComplete }: DistributionSetupProps) {
  const [goal, setGoal] = useState<DistributionGoal>("early_users");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!sessionDbId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/marketing/distribution/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionDbId, goal }),
      });
      const json = await res.json();
      if (!res.ok || !json.config) {
        setError(json.error ?? "Could not save campaign");
        return;
      }
      onComplete(json.config as DistributionCampaignConfig);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kraft-card" style={{ padding: "var(--stack-md)", maxWidth: 560 }}>
      <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
        Create distribution
      </p>
      <p className="sales-intro" style={{ marginBottom: "var(--stack-md)" }}>
        Pick one simple goal. Kami will recommend a campaign angle and a short list of opportunities
        to review — not a content calendar.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          marginBottom: "var(--stack-md)",
        }}
      >
        {GOALS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGoal(g)}
            className="mono"
            style={{
              textAlign: "left",
              border: goal === g ? "2px solid var(--hanko)" : "1px solid var(--outline)",
              background: "transparent",
              padding: "0.75rem",
              cursor: "pointer",
              color: "var(--ink)",
            }}
          >
            <strong>{DISTRIBUTION_GOAL_LABELS[g]}</strong>
            <span style={{ display: "block", color: "var(--ink-soft)", marginTop: 4 }}>
              {GOAL_HELP[g]}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <p className="mono" style={{ color: "var(--hanko)", fontSize: 13, marginBottom: "0.5rem" }}>
          {error}
        </p>
      )}

      <button type="button" className="hanko-btn" onClick={submit} disabled={busy || !sessionDbId}>
        {busy ? "…" : "Recommend my campaign"}
      </button>
    </div>
  );
}
