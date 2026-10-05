"use client";

import { useState } from "react";
import GoalChips from "@/components/GoalChips";
import Skeleton from "@/components/ui/Skeleton";

export interface LaunchParams {
  domain: string;
  goals: string[];
  stage: string | null;
}

interface LandingProps {
  onLaunch: (params: LaunchParams) => void | Promise<void>;
  busy: boolean;
  error?: string | null;
  /** Domain of a saved campaign the founder can continue. */
  resumeDomain?: string | null;
  onResume?: () => void;
  onDismissResume?: () => void;
}

const FEATURES = [
  {
    title: "Brand dossier from your domain",
    body: "One URL in. Kami learns your product, audience, and proof before asking you to configure anything.",
  },
  {
    title: "Find customers",
    body: "A guided first outbound campaign: confirm who to help, check a few companies, approve emails before they send.",
  },
  {
    title: "Create distribution",
    body: "Today’s opportunities across X and research surfaces — drafts you approve, not spam automation.",
  },
  {
    title: "Reviewed actions only",
    body: "Every real send or publish waits for your OK. No invented emails. No surprise posts.",
  },
  {
    title: "Ask Kami",
    body: "A grounded guide on every screen. Ask what to do next — answers use your live campaign state.",
  },
  {
    title: "Self-hosted & BYOK",
    body: "Run locally with your own Hermes, model key, and Supabase. Optional research providers when you want them.",
  },
];

export default function Landing({
  onLaunch,
  busy,
  error,
  resumeDomain,
  onResume,
  onDismissResume,
}: LandingProps) {
  const [domain, setDomain] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [stage, setStage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleaned)) return;
    await onLaunch({ domain: cleaned, goals, stage });
  }

  return (
    <div>
      <section className="landing-hero">
        <h1 className="landing-brand">
          KA<span style={{ color: "var(--hanko)" }}>MI</span>
        </h1>
        <p className="landing-tagline">Your AI go-to-market agency for early-stage startups</p>
        <p className="landing-sub">
          Tell Kami what you built. It helps you find customers and get your product in front of the
          right people.
        </p>

        {resumeDomain && (
          <div className="kraft-card landing-fade landing-resume">
            <p>
              Continue previous campaign for <strong>{resumeDomain}</strong>?
            </p>
            <div className="landing-resume__actions">
              <button type="button" className="hanko-btn" onClick={onResume} disabled={busy}>
                Continue
              </button>
              <button
                type="button"
                className="mono btn-outline"
                onClick={onDismissResume}
                disabled={busy}
              >
                Start new
              </button>
            </div>
          </div>
        )}

        <form className="landing-form" onSubmit={submit}>
          <div className="form-line" style={{ minWidth: 280, textAlign: "left" }}>
            <label className="mono label-caps" htmlFor="domain-input">
              ENTER YOUR DOMAIN TO START
            </label>
            <input
              id="domain-input"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="yourcompany.com"
              disabled={busy}
              autoFocus
            />
          </div>
          <button
            className={resumeDomain ? "btn-secondary landing-cta" : "hanko-btn landing-cta"}
            type="submit"
            disabled={busy}
          >
            {busy ? "Researching your site…" : "Build my first customer plan"}
          </button>
        </form>

        {busy && (
          <div className="landing-progress unfold" role="status" aria-live="polite">
            <p className="mono">
              Reading {domain.trim() || "your site"} and gathering first-party evidence — usually
              20–60 seconds.
            </p>
            <Skeleton lines={2} />
          </div>
        )}

        {error && (
          <p role="alert" className="mono form-error">
            {error}
          </p>
        )}

        <div className="landing-fade-delay">
          <GoalChips
            goals={goals}
            stage={stage}
            onGoalsChange={setGoals}
            onStageChange={setStage}
            disabled={busy}
          />
        </div>
      </section>

      <section className="landing-features">
        <hr className="crease landing-crease" />
        <p className="label-caps" style={{ textAlign: "center", margin: "var(--stack-md) 0" }}>
          What Kami runs for you
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "var(--stack-md)",
          }}
        >
          {FEATURES.map((f) => (
            <div className="kraft-card" key={f.title}>
              <strong style={{ fontFamily: "var(--font-headline)" }}>{f.title}</strong>
              <p style={{ marginTop: "var(--stack-sm)", color: "var(--ink-soft)" }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
