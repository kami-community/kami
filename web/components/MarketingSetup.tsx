"use client";

import { useEffect, useState } from "react";
import type { MarketingConfig, MarketingPlatform, OutreachGoal } from "@/lib/marketingTypes";

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
  const [xConnected, setXConnected] = useState(false);
  const [igConnected, setIgConnected] = useState(false);
  const [xHandle, setXHandle] = useState<string | null>(null);
  const [igHandle, setIgHandle] = useState<string | null>(null);

  useEffect(() => {
    const qs = sessionDbId ? `?session_id=${encodeURIComponent(sessionDbId)}` : "";
    fetch(`/api/accounts${qs}`)
      .then((r) => r.json())
      .then((json) => {
        const accounts = (json.accounts ?? []) as {
          platform: string;
          handle: string | null;
          status: string;
        }[];
        const x = accounts.find((a) => a.platform === "x" && a.status === "connected");
        const ig = accounts.find((a) => a.platform === "instagram" && a.status === "connected");
        setXConnected(Boolean(x));
        setIgConnected(Boolean(ig));
        setXHandle(x?.handle ?? null);
        setIgHandle(ig?.handle ?? null);
      })
      .catch(() => {});
  }, [sessionDbId]);

  function togglePlatform(p: MarketingPlatform) {
    if (p === "x" && !xConnected) return;
    if (p === "instagram" && !igConnected) return;
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function toggleTone(t: string) {
    setTone((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function submit() {
    if (platforms.length === 0 || !sessionDbId) return;
    setSaving(true);
    const payload = {
      session_id: sessionDbId,
      platforms,
      x_boost_budget: platforms.includes("x") ? xBudget : undefined,
      x_outreach_goal: platforms.includes("x") ? xGoal : undefined,
      ig_offer_min: platforms.includes("instagram") ? igOfferMin : undefined,
      ig_offer_max: platforms.includes("instagram") ? igOfferMax : undefined,
      ig_niche_keywords: platforms.includes("instagram")
        ? igKeywords
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      ig_min_followers: platforms.includes("instagram") ? igMinFollowers : undefined,
      tone: useDossierTone ? existingTone : tone,
    };

    try {
      const res = await fetch("/api/marketing/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.config) {
        onComplete(json.config as MarketingConfig);
      } else {
        onComplete({ ...payload, session_id: sessionDbId });
      }
    } catch {
      onComplete({ ...payload, session_id: sessionDbId });
    } finally {
      setSaving(false);
    }
  }

  const hasX = platforms.includes("x");
  const hasIg = platforms.includes("instagram");

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", paddingTop: "var(--stack-lg)" }}>
      <h3 style={{ marginBottom: "var(--stack-md)" }}>Set up Marketing</h3>

      {!sessionDbId && (
        <p className="mono" style={{ color: "var(--hanko)", marginBottom: "var(--stack-md)" }}>
          Waiting for session — launch a campaign first.
        </p>
      )}

      <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
        Connected accounts
      </p>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "var(--stack-md)",
        }}
      >
        <span
          className="mono"
          style={{ fontSize: 12, color: xConnected ? "var(--moss)" : "var(--hanko)" }}
        >
          {xConnected ? `✓ X ${xHandle}` : "✗ X not connected — Log in with X on the landing page"}
        </span>
        <span
          className="mono"
          style={{ fontSize: 12, color: igConnected ? "var(--moss)" : "var(--hanko)" }}
        >
          {igConnected
            ? `✓ Instagram ${igHandle}`
            : "✗ Instagram not connected — Log in with Instagram on the landing page"}
        </span>
      </div>

      <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
        Select platforms
      </p>
      <div style={{ display: "flex", gap: "var(--stack-md)", marginBottom: "var(--stack-lg)" }}>
        {PLATFORM_INFO.map((p) => {
          const locked = (p.key === "x" && !xConnected) || (p.key === "instagram" && !igConnected);
          const selected = platforms.includes(p.key);
          return (
            <button
              key={p.key}
              type="button"
              className="kraft-card"
              onClick={() => togglePlatform(p.key)}
              disabled={locked}
              style={{
                flex: 1,
                cursor: locked ? "not-allowed" : "pointer",
                opacity: locked ? 0.55 : 1,
                border: selected ? "2px solid var(--hanko)" : "1px solid var(--ink)",
                textAlign: "left",
              }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <strong style={{ fontFamily: "var(--font-headline)" }}>{p.name}</strong>
                <span
                  style={{ color: selected ? "var(--hanko)" : "var(--outline)", fontWeight: 700 }}
                >
                  {locked ? "🔒" : selected ? "✓" : "·"}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: "0.4rem" }}>
                {locked ? `Connect ${p.name} first, then select.` : p.blurb}
              </p>
            </button>
          );
        })}
      </div>

      {hasX && (
        <div style={{ marginBottom: "var(--stack-lg)" }}>
          <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
            X — Budget & Goal
          </p>
          <div style={{ display: "flex", gap: "var(--stack-md)", flexWrap: "wrap" }}>
            <div className="form-line" style={{ flex: 1, minWidth: 180 }}>
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
            <div style={{ flex: 1, minWidth: 180 }}>
              <p className="mono label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
                Outreach goal
              </p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {GOALS.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    className="mono"
                    onClick={() => setXGoal(g.key)}
                    style={{
                      background: xGoal === g.key ? "var(--kraft)" : "transparent",
                      border: "1px solid var(--ink)",
                      padding: "0.4rem 0.75rem",
                      cursor: "pointer",
                      color: "var(--ink)",
                    }}
                  >
                    <span
                      style={{
                        color: xGoal === g.key ? "var(--hanko)" : "var(--outline)",
                        fontWeight: 700,
                        marginRight: "0.4rem",
                      }}
                    >
                      {xGoal === g.key ? "✓" : "·"}
                    </span>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {hasIg && (
        <div style={{ marginBottom: "var(--stack-lg)" }}>
          <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
            Instagram — Creator Criteria
          </p>
          <div
            style={{
              display: "flex",
              gap: "var(--stack-md)",
              flexWrap: "wrap",
              marginBottom: "var(--stack-md)",
            }}
          >
            <div className="form-line" style={{ flex: 1, minWidth: 140 }}>
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
            <div className="form-line" style={{ flex: 1, minWidth: 140 }}>
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
            <div className="form-line" style={{ flex: 1, minWidth: 140 }}>
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
        <div style={{ marginBottom: "var(--stack-lg)" }}>
          <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
            Tone & Voice
          </p>
          {existingTone?.length ? (
            <div style={{ marginBottom: "var(--stack-sm)" }}>
              <button
                type="button"
                className="mono"
                onClick={() => setUseDossierTone(!useDossierTone)}
                style={{
                  background: useDossierTone ? "var(--kraft)" : "transparent",
                  border: "1px solid var(--ink)",
                  padding: "0.4rem 0.75rem",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    color: useDossierTone ? "var(--hanko)" : "var(--outline)",
                    fontWeight: 700,
                    marginRight: "0.4rem",
                  }}
                >
                  {useDossierTone ? "✓" : "·"}
                </span>
                Use brand voice from dossier ({existingTone.join(", ")})
              </button>
            </div>
          ) : null}
          {!useDossierTone && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="mono"
                  onClick={() => toggleTone(t)}
                  style={{
                    background: tone.includes(t) ? "var(--kraft)" : "transparent",
                    border: "1px solid var(--ink)",
                    padding: "0.4rem 0.75rem",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      color: tone.includes(t) ? "var(--hanko)" : "var(--outline)",
                      fontWeight: 700,
                      marginRight: "0.4rem",
                    }}
                  >
                    {tone.includes(t) ? "✓" : "·"}
                  </span>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        className="hanko-btn"
        onClick={submit}
        disabled={platforms.length === 0 || !sessionDbId || saving}
      >
        {saving ? "Saving…" : "Launch Marketing"}
      </button>
    </div>
  );
}
