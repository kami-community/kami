"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import LoadingState from "@/components/bui/LoadingState";
import ThinkingState from "@/components/bui/ThinkingState";
import { useStagedProgress } from "@/components/bui/useStagedProgress";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import ChipToggle from "@/components/ui/ChipToggle";
import Field, { Input } from "@/components/ui/Field";
import { IconShield } from "@/components/ui/icons";
import type { CampaignSession } from "@/lib/campaigns/sessions";
import { api, errorMessage } from "@/lib/client/api";
import { rememberCampaign } from "@/lib/client/lastCampaign";
import { cleanDomain, GOALS } from "./constants";

type Goal = (typeof GOALS)[number];

/**
 * Onboarding step 1: the founder's domain (and optional goals). Creating the
 * campaign validates the domain and researches the site (20–60s), so the wait
 * shows a live trace of what Kami is doing.
 */
export default function CompanyStep() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [researching, setResearching] = useState<string | null>(null);

  const staged = useStagedProgress(
    [
      `Checking ${researching ?? "your domain"} is a real company site`,
      "Reading your homepage and key pages",
      "Collecting what your site says about you",
      "Searching for mentions elsewhere",
      "Opening your campaign",
    ],
    busy,
    { stepMs: 4500, failed: Boolean(error) },
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleaned = cleanDomain(domain);
    if (!cleaned) {
      setInvalid("Enter your company’s domain, like acme.com.");
      return;
    }
    setInvalid(null);
    setError(null);
    setResearching(cleaned);
    setBusy(true);
    try {
      const { session } = await api.post<{ session: CampaignSession }>("/api/sessions", {
        domain: cleaned,
        goals,
        stage: null,
      });
      rememberCampaign(session.id);
      router.push(`/start/${session.id}`);
    } catch (err) {
      setError(errorMessage(err, "Could not research that domain"));
      setBusy(false);
    }
  }

  return (
    <section className="onb__panel" aria-labelledby="onb-company-title">
      <div className="onb__intro">
        <h1 id="onb-company-title" className="onb__title">
          What’s your company’s domain?
        </h1>
        <p className="onb__lede">
          Kami reads your site and works out what you sell and who buys it. You check it before
          anything happens.
        </p>
      </div>

      <form className="onb__form" onSubmit={(e) => void submit(e)} noValidate>
        <Field
          label="Company domain"
          hideLabel
          error={invalid}
          hint={busy || invalid ? undefined : "Usually takes 20–60 seconds."}
          className="onb__domain-field"
        >
          <Input
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            placeholder="yourcompany.com"
            value={domain}
            disabled={busy}
            onChange={(e) => {
              setDomain(e.target.value);
              setInvalid(null);
            }}
          />
        </Field>

        {!busy && (
          <div className="onb__goals">
            <p className="onb__goals-label">
              What are you after? <span className="text-3">Optional</span>
            </p>
            <ChipToggle
              label="What are you after? (optional)"
              value={goals}
              onChange={setGoals}
              options={GOALS.map((g) => ({ value: g, label: g }))}
            />
          </div>
        )}

        {busy ? (
          <div className="onb__progress" aria-live="polite">
            <LoadingState
              label={`Researching ${researching ?? "your site"}`}
              startedAt={staged.startedAt ?? undefined}
            />
            <ThinkingState working rows={staged.rows} active="Reading your company" done="Done" />
          </div>
        ) : (
          <Button type="submit" variant="accent" kbd="⏎">
            Research my company
          </Button>
        )}
      </form>

      {error && !busy && (
        <Callout tone="error" title="Kami couldn’t research that domain">
          {error}
        </Callout>
      )}

      <p className="onb__footnote">
        <IconShield size={12} /> Nothing is sent or posted without your OK.
      </p>
    </section>
  );
}
