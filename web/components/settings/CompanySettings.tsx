"use client";

import { useMemo, useState } from "react";
import ContextCards, { type ContextChunk } from "@/components/bui/ContextCards";
import LoadingState from "@/components/bui/LoadingState";
import ThinkingState from "@/components/bui/ThinkingState";
import { useStagedProgress } from "@/components/bui/useStagedProgress";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import ConfirmDialog from "@/components/ConfirmDialog";
import DossierConfirm from "@/components/DossierConfirm";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBody } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { IconArrowUpRight, IconGlobe, IconRefresh } from "@/components/ui/icons";
import { Section } from "@/components/ui/Page";
import { humanize, StatusPill, Tag } from "@/components/ui/Pills";
import { errorMessage } from "@/lib/client/api";
import type { Dossier } from "@/lib/domain/dossier";

const SOURCES_SHOWN = 6;

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function matchStrength(confidence: number): { tone: "green" | "orange" | "red"; label: string } {
  if (confidence >= 0.8) return { tone: "green", label: "Strong match" };
  if (confidence >= 0.5) return { tone: "orange", label: "Partial match" };
  return { tone: "red", label: "Weak match" };
}

/**
 * Settings → Company: who Kami thinks you are. The verified identity, the
 * dossier every agent plans from (edit, correct or rebuild it), and the
 * research it is grounded in.
 *
 * The server un-confirms the dossier whenever it changes, and the workspace
 * needs a confirmed dossier. A saved edit here is a deliberate change, so it
 * is re-confirmed straight away; a full rebuild waits for an explicit OK.
 */
export default function CompanySettings() {
  const campaign = useCampaign();
  const { session, dossier, dossierJob, sessionId } = campaign;
  const confirmed = Boolean(session.dossier_confirmed_at);
  const identity = session.domain_check;
  const sources = useMemo(
    () => session.research_snapshot?.sources ?? [],
    [session.research_snapshot],
  );
  const firstParty = sources.filter((s) => s.source_class === "first_party").length;

  const [version, setVersion] = useState(0);
  const [reconfirming, setReconfirming] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);

  const stages = [
    `Re-reading ${sources.length} source${sources.length === 1 ? "" : "s"} (${firstParty} from your site)`,
    "Brand analyst drafting positioning and voice",
    "Grounding every claim in your site",
    "Compiling customers and competitors",
  ];
  const staged = useStagedProgress(stages, dossierJob.busy, {
    stepMs: 2600,
    failed: Boolean(dossierJob.error),
  });

  const evidence: ContextChunk[] = useMemo(
    () =>
      (showAllSources ? sources : sources.slice(0, SOURCES_SHOWN)).map((s, i) => ({
        key: `${s.url}-${i}`,
        title: s.title || safeHost(s.url),
        meta: s.source_class === "first_party" ? "Your site" : "Mention elsewhere",
        body: s.excerpt.length > 240 ? `${s.excerpt.slice(0, 240)}…` : s.excerpt,
        source: {
          label: safeHost(s.url),
          href: s.url,
          badge: s.source_class === "first_party" ? "1P" : "3P",
          tone: s.source_class === "first_party" ? "var(--green)" : "var(--orange)",
        },
      })),
    [sources, showAllSources],
  );

  async function confirmNow() {
    setReconfirming(true);
    setSaveError(null);
    try {
      await campaign.confirmDossier();
    } catch (err) {
      setSaveError(errorMessage(err, "Saved, but Kami couldn’t re-confirm the dossier"));
    } finally {
      setReconfirming(false);
    }
  }

  function onSaved(next: Dossier) {
    campaign.setDossier(next);
    void confirmNow();
  }

  async function rebuild() {
    setRebuildOpen(false);
    await campaign.generateDossier();
    setVersion((v) => v + 1);
  }

  const match = identity ? matchStrength(identity.confidence) : null;
  const goals = session.goals ?? [];

  return (
    <>
      <Section
        num="01"
        title="Identity"
        desc="The company Kami verified from your domain. Every agent is locked to it."
      >
        <Card>
          <CardBody roomy className="company-identity">
            <span className="company-identity__icon" aria-hidden>
              <IconGlobe size={16} />
            </span>
            <div className="company-identity__copy">
              <span className="company-identity__name">
                {identity?.company_name || dossier?.company || session.canonical_domain}
                {match && <StatusPill tone={match.tone}>{match.label}</StatusPill>}
              </span>
              <span className="company-identity__meta">
                <a
                  className="records-link"
                  href={identity?.final_url || `https://${session.canonical_domain}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {session.canonical_domain} <IconArrowUpRight size={11} />
                </a>
                {identity?.validated_at && (
                  <span>
                    Checked{" "}
                    {new Date(identity.validated_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
              </span>
              {identity?.description && (
                <p className="company-identity__desc">{identity.description}</p>
              )}
            </div>
          </CardBody>
          {(goals.length > 0 || session.stage) && (
            <CardBody className="company-identity__facts">
              {session.stage && (
                <span className="company-identity__fact">
                  <span className="company-identity__label">Stage</span>
                  <Tag>{humanize(session.stage)}</Tag>
                </span>
              )}
              {goals.length > 0 && (
                <span className="company-identity__fact">
                  <span className="company-identity__label">Goals</span>
                  <span className="tag-list">
                    {goals.map((g) => (
                      <Tag key={g}>{humanize(g)}</Tag>
                    ))}
                  </span>
                </span>
              )}
            </CardBody>
          )}
        </Card>
        {match?.tone === "red" && (
          <div className="settings-note">
            <Callout tone="warn" title="Kami isn’t sure this is your company">
              The site at {session.canonical_domain} didn’t clearly match. Check the dossier below
              and correct anything that describes a different business.
            </Callout>
          </div>
        )}
      </Section>

      <Section
        num="02"
        title="Dossier"
        desc="What every agent plans from. Saving an edit re-confirms it; agents use the new version on their next run."
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={<IconRefresh size={13} />}
            disabled={dossierJob.busy || reconfirming}
            onClick={() => setRebuildOpen(true)}
          >
            Rebuild…
          </Button>
        }
      >
        <div className="stack">
          {!confirmed && !dossierJob.busy && !reconfirming && !saveError && dossier && (
            <Callout tone="warn" title="This dossier isn’t confirmed">
              Until you confirm it, Kami won’t plan, research or send. Check it below, then confirm.
            </Callout>
          )}
          {reconfirming && (
            <LoadingState label="Saving and re-confirming your dossier…" elapsed={false} />
          )}
          {saveError && (
            <Callout
              tone="error"
              title="Not confirmed"
              actions={
                <Button size="sm" variant="secondary" onClick={() => void confirmNow()}>
                  Try again
                </Button>
              }
            >
              {saveError}
            </Callout>
          )}
          {dossierJob.error && (
            <Callout tone="error" title="Kami couldn’t rebuild the dossier">
              {dossierJob.error}
            </Callout>
          )}

          {dossierJob.busy ? (
            <div className="settings-wait">
              <LoadingState
                label="Brand analyst is rebuilding your dossier…"
                startedAt={staged.startedAt ?? undefined}
              />
              <ThinkingState working rows={staged.rows} active="Rebuilding" done="Dossier ready" />
            </div>
          ) : dossier ? (
            <DossierConfirm
              key={version}
              dossier={dossier}
              sessionDbId={sessionId}
              onConfirm={campaign.confirmDossier}
              onDossierUpdated={onSaved}
              confirmed={confirmed}
              confirmLabel={confirmed ? "Looks right" : "Confirm this dossier"}
            />
          ) : (
            <EmptyState title="No dossier yet">
              Rebuild it from your research to give the agents something to plan from.
            </EmptyState>
          )}
        </div>
      </Section>

      <Section
        num="03"
        title="Evidence"
        desc={`${sources.length} source${sources.length === 1 ? "" : "s"} the dossier is grounded in — ${firstParty} from your own site.`}
      >
        {sources.length === 0 ? (
          <EmptyState title="No research saved">Kami had only your domain to work from.</EmptyState>
        ) : (
          <div className="stack">
            <ContextCards header="Sources" count={sources.length} chunks={evidence} />
            {sources.length > SOURCES_SHOWN && (
              <div>
                <Button
                  size="xs"
                  variant="quiet"
                  aria-expanded={showAllSources}
                  onClick={() => setShowAllSources((v) => !v)}
                >
                  {showAllSources ? "Show fewer" : `Show all ${sources.length} sources`}
                </Button>
              </div>
            )}
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={rebuildOpen}
        title="Rebuild the dossier from scratch?"
        body={
          <p>
            The brand analyst rereads your research and writes a new dossier. Your edits are
            replaced, and you’ll confirm the new version before Kami plans, researches or sends
            again.
          </p>
        }
        confirmLabel="Rebuild dossier"
        tone="danger"
        onConfirm={() => void rebuild()}
        onCancel={() => setRebuildOpen(false)}
      />
    </>
  );
}
