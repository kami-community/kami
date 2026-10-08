"use client";

import { useEffect, useRef, useState } from "react";
import LoadingState from "@/components/bui/LoadingState";
import RecommendationCard from "@/components/bui/RecommendationCard";
import ThinkingState from "@/components/bui/ThinkingState";
import { useStagedProgress } from "@/components/bui/useStagedProgress";
import { PLATFORM_LABELS, platformIcon } from "@/components/marketing/platforms";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBody, CardFooter } from "@/components/ui/Card";
import ChipToggle from "@/components/ui/ChipToggle";
import Field, { Input, Textarea } from "@/components/ui/Field";
import { IconEdit, IconMegaphone } from "@/components/ui/icons";
import { Section } from "@/components/ui/Page";
import { StatusPill, ValuePill } from "@/components/ui/Pills";
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
  /** show an already-approved plan for editing instead of skipping past it */
  editApproved?: boolean;
}

/** No usable plan yet: neither a proposed nor an approved one with an angle. */
function needsRecommendation(c: DistributionCampaignConfig | null | undefined): boolean {
  return !(c?.angle && (c.status === "proposed" || c.status === "approved"));
}

const RECOMMEND_STAGES = [
  "Reading your confirmed dossier",
  "Distribution manager choosing the job",
  "Picking up to three surfaces",
  "Writing the campaign angle",
];

/** The distribution plan: Kami recommends one move; the founder edits and approves it. */
export default function DistributionSetup({
  sessionDbId,
  initialConfig,
  onComplete,
  editApproved = false,
}: DistributionSetupProps) {
  const [config, setConfig] = useState<DistributionCampaignConfig | null>(initialConfig ?? null);
  const [source, setSource] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(
    () => Boolean(sessionDbId) && needsRecommendation(initialConfig),
  );
  const [error, setError] = useState<string | null>(null);
  const [reviseNote, setReviseNote] = useState("");
  const [editing, setEditing] = useState(false);

  const [goalLabel, setGoalLabel] = useState(
    initialConfig ? initialConfig.goal_label || initialConfig.goal.replace(/_/g, " ") : "",
  );
  const [angle, setAngle] = useState(initialConfig?.angle ?? "");
  const [surfaces, setSurfaces] = useState<DistributionPlatform[]>(
    initialConfig?.surfaces?.length ? initialConfig.surfaces : [],
  );
  const [rationale, setRationale] = useState(initialConfig?.rationale ?? "");
  const [whySurfaces, setWhySurfaces] = useState(initialConfig?.why_these_surfaces ?? "");
  const staged = useStagedProgress(RECOMMEND_STAGES, busy && !editing, { stepMs: 2800 });

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
      .post<{ config: DistributionCampaignConfig; source?: string; note?: string | null }>(
        "/api/marketing/distribution/setup",
        {
          session_id: sessionId,
          action: "recommend",
          ...(withRevise?.trim() ? { revise_note: withRevise.trim() } : {}),
        },
      )
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
    setEditing(false);
    setError(null);
    void requestRecommendation(sessionDbId, withRevise);
  }

  // Recommend at most once per session, even when effects run twice (Strict Mode).
  const requestedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionDbId || requestedFor.current === sessionDbId) return;
    requestedFor.current = sessionDbId;
    if (initialConfig?.status === "approved" && initialConfig.angle && !editApproved) {
      onComplete(initialConfig);
      return;
    }
    if (needsRecommendation(initialConfig)) void requestRecommendation(sessionDbId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when session ready
  }, [sessionDbId]);

  async function approve() {
    if (!sessionDbId || !config) throw new Error("No plan to approve yet.");
    if (!angle.trim() || !surfaces.length) {
      setEditing(true);
      throw new Error("Add an angle and at least one surface before approving.");
    }
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
    setEditing(false);
    onComplete(json.config);
  }

  if (!config && busy) {
    return (
      <div className="stage stage--start">
        <div className="dist-wait">
          <LoadingState
            label="Distribution manager is choosing your next move…"
            startedAt={staged.startedAt ?? undefined}
            detail="One job, one angle and up to three surfaces, picked from your confirmed dossier."
          />
          <ThinkingState working rows={staged.rows} active="Planning" done="Plan ready" />
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <Callout
        tone={error ? "error" : "neutral"}
        title={error ? "Kami couldn’t recommend a plan" : "No distribution plan yet"}
        actions={
          <Button
            size="sm"
            variant="accent"
            onClick={() => recommend()}
            disabled={busy || !sessionDbId}
          >
            Recommend a plan
          </Button>
        }
      >
        {error}
      </Callout>
    );
  }

  const approved = config.status === "approved";

  return (
    <>
      <Section
        num="01"
        title={approved ? "Your distribution plan" : "Approve your distribution plan"}
        desc={
          source === "fallback"
            ? "A starter plan built from your dossier — Hermes was unavailable."
            : "Kami’s recommended next move. Nothing is researched until you approve."
        }
        actions={
          approved ? (
            <StatusPill tone="green">Approved</StatusPill>
          ) : (
            <StatusPill tone="orange">Proposed</StatusPill>
          )
        }
      >
        {busy ? (
          <div className="stage stage--start">
            <div className="dist-wait">
              <LoadingState
                label="Distribution manager is rethinking the plan…"
                startedAt={staged.startedAt ?? undefined}
              />
              <ThinkingState working rows={staged.rows} active="Planning" done="Plan ready" />
            </div>
          </div>
        ) : (
          <div className="stage">
            <div className="dist-reco">
              <RecommendationCard
                title={goalLabel || "Distribution plan"}
                options={[
                  {
                    key: "plan",
                    short: goalLabel,
                    body: (
                      <>
                        {angle || "No angle yet — edit the plan."}
                        {surfaces.length > 0 && (
                          <span className="row row--wrap dist-reco__surfaces">
                            {surfaces.map((s) => (
                              <ValuePill key={s}>{PLATFORM_LABELS[s]}</ValuePill>
                            ))}
                          </span>
                        )}
                      </>
                    ),
                    confidence:
                      source === "fallback"
                        ? { signal: 1, label: "Starter plan" }
                        : { signal: 3, label: "Recommended" },
                    cta: approved ? "Save plan" : "Approve plan",
                    onAccept: approve,
                  },
                ]}
                labels={{ accepted: approved ? "Saved" : "Approved" }}
                secondary={
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<IconEdit size={12} />}
                    aria-expanded={editing}
                    onClick={() => setEditing((e) => !e)}
                  >
                    Edit
                  </Button>
                }
                footer={
                  <div className="reco__revise">
                    <Input
                      size="sm"
                      aria-label="Tell Kami what to change"
                      value={reviseNote}
                      onChange={(e) => setReviseNote(e.target.value)}
                      placeholder="Not right? e.g. focus on a Product Hunt launch this month"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && reviseNote.trim()) recommend(reviseNote);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => recommend(reviseNote)}
                      disabled={!sessionDbId}
                    >
                      Try another
                    </Button>
                  </div>
                }
              />
            </div>
          </div>
        )}
        {note && <p className="text-3 text-xs dist-note">{note}</p>}
        {error && (
          <div className="dist-note">
            <Callout tone="error">{error}</Callout>
          </div>
        )}
      </Section>

      {editing && (
        <Section
          num="02"
          title="Edit the plan"
          desc="Your words win — Kami researches against exactly this."
        >
          <Card className="fade-up">
            <CardBody roomy className="form-stack">
              <Field label="Job (plain English)">
                <Input value={goalLabel} onChange={(e) => setGoalLabel(e.target.value)} />
              </Field>
              <Field label="Campaign angle">
                <Textarea rows={3} value={angle} onChange={(e) => setAngle(e.target.value)} />
              </Field>
              <div className="field">
                <span className="field__label">Surfaces · up to 3</span>
                <ChipToggle
                  label="Surfaces"
                  max={3}
                  value={surfaces}
                  onChange={setSurfaces}
                  options={DISTRIBUTION_PLATFORMS.map((p) => ({
                    value: p,
                    label: PLATFORM_LABELS[p],
                    icon: platformIcon(p, 10),
                  }))}
                />
              </div>
              <Field label="Why this plan">
                <Textarea
                  rows={2}
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                />
              </Field>
              <Field label="Why these surfaces">
                <Textarea
                  rows={2}
                  value={whySurfaces}
                  onChange={(e) => setWhySurfaces(e.target.value)}
                />
              </Field>
            </CardBody>
            <CardFooter>
              <span className="text-3 text-xs">
                <IconMegaphone size={12} /> Approve from the card above when it reads right.
              </span>
              <Button size="sm" variant="quiet" onClick={() => setEditing(false)}>
                Done editing
              </Button>
            </CardFooter>
          </Card>
        </Section>
      )}
    </>
  );
}
