"use client";

import { useState } from "react";
import FineTuneCard, { type FineTuneState } from "@/components/bui/FineTuneCard";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBody, CardFooter } from "@/components/ui/Card";
import Disclosure from "@/components/ui/Disclosure";
import Field, { Input, Textarea } from "@/components/ui/Field";
import { PageHeader, Section } from "@/components/ui/Page";
import Segmented from "@/components/ui/Segmented";
import Toggle from "@/components/ui/Toggle";
import { api, errorMessage } from "@/lib/client/api";
import type { Dossier } from "@/lib/domain/dossier";
import {
  configToNlPrefill,
  dossierToNlPrefill,
  nlPrefillToConfig,
  salesWhoLabel,
  type SalesNlPrefill,
} from "@/lib/salesDossierPrefill";
import type { SalesCampaignConfig, SalesChannel } from "@/lib/salesTypes";

interface SalesSetupProps {
  sessionDbId: string | null;
  dossier: Dossier | null;
  domain: string;
  existingConfig?: SalesCampaignConfig | null;
  goals?: string[];
  onComplete: (config: SalesCampaignConfig, planGenerated: boolean) => void;
  /**
   * `setup` (default): first-time who and what in Find customers. Pace and autonomy
   * stay in Settings → Sending; this step still saves the default guardrails.
   * `settings`: Settings → Sending — guardrails first, no page header, a plain save.
   */
  mode?: "setup" | "settings";
  /** Rendered under another page header (e.g. the Find customers area): drop this component's own PageHeader. */
  embedded?: boolean;
}

const QTY_OPTIONS = ["10", "15", "25"] as const;

/** Guardrail presets: how fast Kami may send once you approve. */
const PACE: Record<string, number> = { careful: 10, balanced: 35, fast: 80 };

function paceFor(cap: number): string {
  return Object.entries(PACE).find(([, v]) => v === cap)?.[0] ?? "balanced";
}

/** Confirm who and what: prefilled from the dossier, then saved as the Sales setup. */
export default function SalesSetup({
  sessionDbId,
  dossier,
  domain,
  existingConfig,
  goals,
  onComplete,
  mode = "setup",
  embedded = false,
}: SalesSetupProps) {
  const inSettings = mode === "settings";
  // Prefill once on mount; the parent remounts (via `key`) when the source changes.
  const [initial] = useState(() =>
    existingConfig
      ? configToNlPrefill(existingConfig)
      : dossierToNlPrefill(dossier, domain, null, goals),
  );

  const [whoSentence, setWhoSentence] = useState(initial.whoSentence);
  const [whatSentence, setWhatSentence] = useState(initial.whatSentence);
  const [targetQty, setTargetQty] = useState(initial.targetQty);
  const [icpTitles, setIcpTitles] = useState(initial.icpTitles);
  const [icpIndustries, setIcpIndustries] = useState(initial.icpIndustries);
  const [geo, setGeo] = useState(initial.geo);
  const [exclusions, setExclusions] = useState(existingConfig?.exclusions?.join("\n") ?? "");
  const initialCap = existingConfig?.daily_send_cap ?? 35;
  const [guardrails, setGuardrails] = useState<FineTuneState>({
    segment: paceFor(initialCap),
    values: { cap: initialCap },
    type: null,
  });
  const [autoFollowups, setAutoFollowups] = useState(
    existingConfig?.autonomy?.auto_followups ?? false,
  );
  const [requireFirstSendApproval, setRequireFirstSendApproval] = useState(
    existingConfig?.autonomy?.require_first_send_approval ?? true,
  );
  const [channels] = useState<SalesChannel[]>(existingConfig?.allowed_channels ?? ["email"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dailyCap = guardrails.values.cap ?? initialCap;

  async function submit() {
    if (!sessionDbId || !whatSentence.trim()) return;
    setSaving(true);
    setError(null);

    const prefill: SalesNlPrefill = {
      whoSentence,
      whatSentence,
      targetQty,
      icpTitles,
      icpIndustries,
      geo,
      offer: whatSentence.slice(0, 280),
      positioningLine: whatSentence.slice(0, 140),
    };

    const payload = nlPrefillToConfig(sessionDbId, prefill, {
      exclusions,
      dealMin: existingConfig?.deal_range?.min != null ? String(existingConfig.deal_range.min) : "",
      dealMax: existingConfig?.deal_range?.max != null ? String(existingConfig.deal_range.max) : "",
      dailyCap,
      senderName: existingConfig?.sender_identity?.name ?? "",
      senderEmail: existingConfig?.sender_identity?.email ?? "",
      autoFollowups,
      requireFirstSendApproval,
      channels,
    });

    try {
      const { config } = await api.post<{ config: SalesCampaignConfig }>(
        "/api/sales/setup",
        payload,
      );
      // The plan is generated after ICP segments are confirmed.
      onComplete(config, false);
    } catch (err) {
      setError(errorMessage(err, "Could not save the sales setup"));
    } finally {
      setSaving(false);
    }
  }

  const whoSection = (
    <Section
      num={inSettings ? "02" : "01"}
      title="Who and what"
      desc={
        inSettings
          ? "Who Kami looks for and what your emails offer. Changing these asks you to re-check your customer segments."
          : "In plain sentences — Kami turns them into a targeting brief."
      }
    >
      <Card>
        <CardBody roomy className="form-stack">
          <Field label={salesWhoLabel(goals)}>
            <Textarea
              rows={3}
              value={whoSentence}
              onChange={(e) => setWhoSentence(e.target.value)}
            />
          </Field>
          <Field
            label="What should we say you help with?"
            error={!whatSentence.trim() ? "Required" : null}
          >
            <Textarea
              rows={3}
              value={whatSentence}
              onChange={(e) => setWhatSentence(e.target.value)}
            />
          </Field>
          <div className="field">
            <span className="field__label" id="qty-label">
              How many companies should we research first?
            </span>
            <div>
              <Segmented
                label="Companies to research first"
                value={String(targetQty) as (typeof QTY_OPTIONS)[number]}
                onChange={(v) => setTargetQty(Number(v))}
                options={QTY_OPTIONS.map((n) => ({ value: n, label: `${n} companies` }))}
              />
            </div>
          </div>
          <Disclosure label="Targeting details">
            <div className="field-grid">
              <Field label="Titles">
                <Input value={icpTitles} onChange={(e) => setIcpTitles(e.target.value)} />
              </Field>
              <Field label="Industries">
                <Input value={icpIndustries} onChange={(e) => setIcpIndustries(e.target.value)} />
              </Field>
              <Field label="Geography">
                <Input value={geo} onChange={(e) => setGeo(e.target.value)} placeholder="US, UK" />
              </Field>
            </div>
          </Disclosure>
        </CardBody>
      </Card>
    </Section>
  );

  const guardrailsSection = (
    <Section
      num={inSettings ? "01" : "02"}
      title={inSettings ? "Email guardrails" : "Guardrails"}
      desc="Limits Kami can never exceed — every send still needs your click."
    >
      <div className="grid-2">
        <FineTuneCard
          title="Send pace"
          sectionLabel="Pace"
          segments={[
            { key: "careful", label: "Careful", ariaLabel: "Careful pace" },
            { key: "balanced", label: "Balanced", ariaLabel: "Balanced pace" },
            { key: "fast", label: "Fast", ariaLabel: "Fast pace" },
          ]}
          fields={[
            { key: "cap", label: "Daily cap", value: initialCap, min: 1, max: 200, suffix: "/day" },
          ]}
          adjustLabel="Drag to adjust"
          value={guardrails}
          onChange={(next) => {
            const presetChanged = next.segment !== guardrails.segment;
            setGuardrails(
              presetChanged
                ? {
                    ...next,
                    values: { ...next.values, cap: PACE[next.segment] ?? next.values.cap },
                  }
                : next,
            );
          }}
        />
        <Card>
          <CardBody className="stack stack--sm">
            <Toggle
              checked={requireFirstSendApproval}
              onChange={setRequireFirstSendApproval}
              label="Require approval before the first send"
              hint="The campaign’s first email waits for an explicit go-ahead."
            />
            <Toggle
              checked={autoFollowups}
              onChange={setAutoFollowups}
              label="Plan follow-ups in sequences"
              hint="Follow-ups stay drafts — approval and send gates still apply."
            />
          </CardBody>
        </Card>
      </div>
      <div className="sales-setup__exclusions">
        <Field
          label="Exclusions"
          optional
          hint="Domains or company names to skip during Find, one per line."
        >
          <Textarea rows={2} value={exclusions} onChange={(e) => setExclusions(e.target.value)} />
        </Field>
      </div>
    </Section>
  );

  return (
    <>
      {!inSettings && !embedded && (
        <PageHeader
          eyebrow="Find customers"
          title={existingConfig ? "Sales setup" : "Confirm who and what"}
          lede="Kami filled this from your company research. Edit anything that looks wrong, then confirm who to reach first."
        />
      )}
      {!sessionDbId && (
        <Callout tone="warn">Waiting for the campaign session — launch a campaign first.</Callout>
      )}

      {inSettings && guardrailsSection}
      {whoSection}

      {error && <Callout tone="error">{error}</Callout>}

      <Card tone="flat" className="sticky-actions">
        <CardFooter plain>
          <span className="text-3 text-xs">
            {inSettings
              ? "Applies to the next drafts and sends. Nothing is sent by saving."
              : "Next: confirm who to reach first. Nothing is researched or sent yet."}
          </span>
          <Button
            variant="accent"
            busy={saving}
            onClick={() => void submit()}
            disabled={!sessionDbId || !whatSentence.trim()}
          >
            {inSettings ? "Save sending settings" : "Looks good — continue"}
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
