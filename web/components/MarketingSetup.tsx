"use client";

import ConnectSocials, { useConnections } from "@/components/ConnectSocials";
import { useState } from "react";
import type { MarketingConfig, MarketingPlatform, OutreachGoal } from "@/lib/marketingTypes";
import { api, errorMessage } from "@/lib/client/api";

interface MarketingSetupProps {
  sessionDbId: string | null;
  existingTone?: string[];
  onComplete: (config: MarketingConfig) => void;
}

const PLATFORM_INFO: { key: MarketingPlatform; name: string; blurb: string }[] = [
  {
    key: "x",
    name: "X (Twitter)",
    blurb: "Boost high-performing posts and cold outreach to potential customers.",
  },
  {
    key: "instagram",
    name: "Instagram",
    blurb: "Find and negotiate with content creators in your niche.",
  },
];

const GOALS: { key: OutreachGoal; label: string }[] = [
  { key: "drive_signups", label: "Drive signups" },
  { key: "book_demo", label: "Book demos" },
  { key: "awareness", label: "Build awareness" },
];

const TONES = ["professional", "casual", "witty", "direct"];

function ToggleChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="chip-toggle" aria-pressed={pressed} onClick={onClick}>
      <span className="chip-toggle__mark" aria-hidden>
        {pressed ? "✓" : "·"}
      </span>
      {children}
    </button>
  );
}

export default function MarketingSetup({
  sessionDbId,
  existingTone,
  onComplete,
}: MarketingSetupProps) {
  const [platforms, setPlatforms] = useState<MarketingPlatform[]>([]);
  const [xBudget, setXBudget] = useState(200);
  const [xGoal, setXGoal] = useState<OutreachGoal>("drive_signups");
  const [igOfferMin, setIgOfferMin] = useState(50);
  const [igOfferMax, setIgOfferMax] = useState(300);
  const [igKeywords, setIgKeywords] = useState("");
  const [igMinFollowers, setIgMinFollowers] = useState(5000);
  const [tone, setTone] = useState<string[]>(existingTone ?? []);
  const [useDossierTone, setUseDossierTone] = useState(Boolean(existingTone?.length));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { handleOf, error: connectionsError } = useConnections(sessionDbId);
  const xConnected = Boolean(handleOf("x"));
  const igConnected = Boolean(handleOf("instagram"));

  function togglePlatform(p: MarketingPlatform) {
    if (p === "x" && !xConnected) return;
    if (p === "instagram" && !igConnected) return;
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function toggleTone(t: string) {
    setTone((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (platforms.length === 0 || !sessionDbId) return;
    const hasX = platforms.includes("x");
    const hasIg = platforms.includes("instagram");
    setSaving(true);
    setError(null);
    try {
      const { config } = await api.post<{ config: MarketingConfig }>("/api/marketing/setup", {
        session_id: sessionDbId,
        platforms,
        x_boost_budget: hasX ? xBudget : undefined,
        x_outreach_goal: hasX ? xGoal : undefined,
        ig_offer_min: hasIg ? igOfferMin : undefined,
        ig_offer_max: hasIg ? igOfferMax : undefined,
        ig_niche_keywords: hasIg
          ? igKeywords
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        ig_min_followers: hasIg ? igMinFollowers : undefined,
        tone: useDossierTone ? existingTone : tone,
      });
      onComplete(config);
    } catch (err) {
      setError(errorMessage(err, "Could not save Marketing setup"));
    } finally {
      setSaving(false);
    }
  }

  const hasX = platforms.includes("x");
  const hasIg = platforms.includes("instagram");

  return (
    <form className="setup-form" onSubmit={submit}>
      <h3>Set up Marketing</h3>

      {!sessionDbId && (
        <p role="alert" className="form-error">
          Waiting for session — launch a campaign first.
        </p>
      )}

      {sessionDbId && (
        <div className="setup-section">
          <ConnectSocials sessionId={sessionDbId} />
          {connectionsError && (
            <p role="alert" className="form-error">
              {connectionsError}
            </p>
          )}
        </div>
      )}

      <fieldset className="setup-section">
        <legend className="label-caps">Select platforms</legend>
        <div className="choice-grid">
          {PLATFORM_INFO.map((p) => {
            const locked =
              (p.key === "x" && !xConnected) || (p.key === "instagram" && !igConnected);
            const selected = platforms.includes(p.key);
            return (
              <button
                key={p.key}
                type="button"
                className="kraft-card choice-card"
                aria-pressed={selected}
                onClick={() => togglePlatform(p.key)}
                disabled={locked}
              >
                <span className="choice-card__head">
                  {p.name}
                  <span className="choice-card__mark" aria-hidden>
                    {locked ? "🔒" : selected ? "✓" : "·"}
                  </span>
                </span>
                <span className="choice-card__blurb">
                  {locked ? `Connect ${p.name} first, then select.` : p.blurb}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {hasX && (
        <div className="setup-section">
          <p className="label-caps">X — Budget &amp; Goal</p>
          <div className="field-row">
            <div className="form-line">
              <label className="mono label-caps" htmlFor="x-budget">
                Monthly boost budget ($)
              </label>
              <input
                id="x-budget"
                type="number"
                min={0}
                value={xBudget}
                onChange={(e) => setXBudget(Number(e.target.value))}
              />
            </div>
            <div>
              <p className="mono label-caps">Outreach goal</p>
              <div className="chip-row">
                {GOALS.map((g) => (
                  <ToggleChip key={g.key} pressed={xGoal === g.key} onClick={() => setXGoal(g.key)}>
                    {g.label}
                  </ToggleChip>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {hasIg && (
        <div className="setup-section">
          <p className="label-caps">Instagram — Creator Criteria</p>
          <div className="field-row">
            <div className="form-line">
              <label className="mono label-caps" htmlFor="ig-offer-min">
                Offer min ($)
              </label>
              <input
                id="ig-offer-min"
                type="number"
                min={0}
                value={igOfferMin}
                onChange={(e) => setIgOfferMin(Number(e.target.value))}
              />
            </div>
            <div className="form-line">
              <label className="mono label-caps" htmlFor="ig-offer-max">
                Offer max ($)
              </label>
              <input
                id="ig-offer-max"
                type="number"
                min={0}
                value={igOfferMax}
                onChange={(e) => setIgOfferMax(Number(e.target.value))}
              />
            </div>
            <div className="form-line">
              <label className="mono label-caps" htmlFor="ig-min-followers">
                Min followers
              </label>
              <input
                id="ig-min-followers"
                type="number"
                min={0}
                value={igMinFollowers}
                onChange={(e) => setIgMinFollowers(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="form-line">
            <label className="mono label-caps" htmlFor="ig-keywords">
              Niche keywords (comma-separated)
            </label>
            <input
              id="ig-keywords"
              value={igKeywords}
              onChange={(e) => setIgKeywords(e.target.value)}
              placeholder="dev tools, productivity, SaaS"
            />
          </div>
        </div>
      )}

      {platforms.length > 0 && (
        <div className="setup-section">
          <p className="label-caps">Tone &amp; Voice</p>
          {existingTone?.length ? (
            <div className="chip-row">
              <ToggleChip pressed={useDossierTone} onClick={() => setUseDossierTone((v) => !v)}>
                Use brand voice from dossier ({existingTone.join(", ")})
              </ToggleChip>
            </div>
          ) : null}
          {!useDossierTone && (
            <div className="chip-row">
              {TONES.map((t) => (
                <ToggleChip key={t} pressed={tone.includes(t)} onClick={() => toggleTone(t)}>
                  {t}
                </ToggleChip>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="hanko-btn"
        disabled={platforms.length === 0 || !sessionDbId || saving}
      >
        {saving ? "Saving…" : "Launch Marketing"}
      </button>
    </form>
  );
}
