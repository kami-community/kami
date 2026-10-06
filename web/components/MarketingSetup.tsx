"use client";

import { useState } from "react";
import ConnectSocials, { useConnections } from "@/components/ConnectSocials";
import { PlatformMark } from "@/components/marketing/platforms";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBody, CardFooter } from "@/components/ui/Card";
import ChipToggle from "@/components/ui/ChipToggle";
import Field, { Input } from "@/components/ui/Field";
import { IconCheck } from "@/components/ui/icons";
import { Section } from "@/components/ui/Page";
import Segmented from "@/components/ui/Segmented";
import Toggle from "@/components/ui/Toggle";
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

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
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
    <form onSubmit={submit}>
      {!sessionDbId && (
        <Callout tone="warn">Waiting for the campaign session — launch a campaign first.</Callout>
      )}

      <Section
        num="01"
        title="Accounts"
        desc="Connect the accounts Kami may DM from. Nothing sends without your click."
      >
        {sessionDbId && <ConnectSocials sessionId={sessionDbId} />}
        {connectionsError && (
          <p className="field__error" role="alert">
            {connectionsError}
          </p>
        )}
      </Section>

      <Section num="02" title="Platforms" desc="Pick where the creator CRM works.">
        <div className="grid-2">
          {PLATFORM_INFO.map((p) => {
            const locked =
              (p.key === "x" && !xConnected) || (p.key === "instagram" && !igConnected);
            const selected = platforms.includes(p.key);
            return (
              <button
                key={p.key}
                type="button"
                className="choice card card--interactive"
                aria-pressed={selected}
                onClick={() => togglePlatform(p.key)}
                disabled={locked}
              >
                <span className="choice__head">
                  <PlatformMark platform={p.key} size={20} />
                  <span className="choice__name">{p.name}</span>
                  <span className="choice__mark" aria-hidden>
                    {selected ? <IconCheck size={11} strokeWidth={3} /> : null}
                  </span>
                </span>
                <span className="choice__blurb">
                  {locked ? `Connect ${p.name} first, then select.` : p.blurb}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {hasX && (
        <Section num="03" title="X — budget & goal">
          <Card>
            <CardBody roomy className="field-grid">
              <Field label="Monthly boost budget ($)">
                <Input
                  type="number"
                  min={0}
                  value={xBudget}
                  onChange={(e) => setXBudget(Number(e.target.value))}
                />
              </Field>
              <div className="field">
                <span className="field__label">Outreach goal</span>
                <Segmented
                  label="Outreach goal"
                  value={xGoal}
                  onChange={setXGoal}
                  options={GOALS.map((g) => ({ value: g.key, label: g.label }))}
                />
              </div>
            </CardBody>
          </Card>
        </Section>
      )}

      {hasIg && (
        <Section num={hasX ? "04" : "03"} title="Instagram — creator criteria">
          <Card>
            <CardBody roomy className="form-stack">
              <div className="field-grid">
                <Field label="Offer min ($)">
                  <Input
                    type="number"
                    min={0}
                    value={igOfferMin}
                    onChange={(e) => setIgOfferMin(Number(e.target.value))}
                  />
                </Field>
                <Field label="Offer max ($)">
                  <Input
                    type="number"
                    min={0}
                    value={igOfferMax}
                    onChange={(e) => setIgOfferMax(Number(e.target.value))}
                  />
                </Field>
                <Field label="Min followers">
                  <Input
                    type="number"
                    min={0}
                    value={igMinFollowers}
                    onChange={(e) => setIgMinFollowers(Number(e.target.value))}
                  />
                </Field>
              </div>
              <Field
                label="Niche keywords"
                hint="Comma-separated, e.g. dev tools, productivity, SaaS"
              >
                <Input value={igKeywords} onChange={(e) => setIgKeywords(e.target.value)} />
              </Field>
            </CardBody>
          </Card>
        </Section>
      )}

      {platforms.length > 0 && (
        <Section title="Tone & voice">
          <Card>
            <CardBody className="stack stack--sm">
              {existingTone?.length ? (
                <Toggle
                  checked={useDossierTone}
                  onChange={setUseDossierTone}
                  label="Use the brand voice from your dossier"
                  hint={existingTone.join(", ")}
                />
              ) : null}
              {!useDossierTone && (
                <ChipToggle
                  label="Tone"
                  value={tone}
                  onChange={setTone}
                  options={TONES.map((t) => ({ value: t, label: t }))}
                />
              )}
            </CardBody>
          </Card>
        </Section>
      )}

      {error && <Callout tone="error">{error}</Callout>}

      <Card tone="flat" className="sticky-actions">
        <CardFooter plain>
          <span className="text-3 text-xs">
            Discovery runs only when you ask; every DM needs your approval.
          </span>
          <Button
            type="submit"
            variant="accent"
            busy={saving}
            disabled={platforms.length === 0 || !sessionDbId}
          >
            Save creator CRM
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
