"use client";

import { useState } from "react";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { Dossier } from "@/lib/domain/dossier";
import type { SalesCampaignConfig, SalesPlan } from "@/lib/salesTypes";
import type { SalesSegment } from "@/lib/domain/segments";
import SalesSetup from "@/components/SalesSetup";
import SalesPlanView from "@/components/SalesPlanView";
import SalesDraftQueue from "@/components/SalesDraftQueue";
import SalesTargetReview from "@/components/sales/target-review/SalesTargetReview";
import SalesNeedsYou from "@/components/SalesNeedsYou";
import SalesPipeline from "@/components/SalesPipeline";
import SalesInbox from "@/components/SalesInbox";
import MeetingQueue from "@/components/MeetingQueue";
import SalesTaskBoard from "@/components/SalesTaskBoard";
import KillSwitch from "@/components/KillSwitch";
import SegmentConfirm from "@/components/SegmentConfirm";

/** Steps shown after setup is complete (Confirm who/what is full-screen SalesSetup only). */
export type SalesGuidedStep = "confirm" | "segments" | "plan" | "find" | "emails" | "needs";

type OpsStep = "segments" | "plan" | "find" | "emails" | "needs";
type PlanSource = "hermes" | "offline_fallback" | "client";

const OPS_STEPS: { key: OpsStep; label: string }[] = [
  { key: "segments", label: "Confirm ICP" },
  { key: "plan", label: "Plan" },
  { key: "find", label: "Find" },
  { key: "emails", label: "Emails" },
  { key: "needs", label: "Needs you" },
];

interface SalesPanelProps {
  sessionDbId: string | null;
  config: SalesCampaignConfig | null;
  dossier: Dossier | null;
  domain: string;
  goals?: string[];
  focusStep?: SalesGuidedStep | null;
  onSetup: (config: SalesCampaignConfig) => void;
  /** Route PLG/D2C founders to Marketing distribution. */
  onCreateDistribution?: () => void;
}

interface Progress {
  sequencesCreated: boolean;
  hasSent: boolean;
}

function defaultOpsStep(
  config: SalesCampaignConfig | null,
  plan: SalesPlan | null,
  progress: Progress,
): OpsStep {
  if (!config?.segments_confirmed_at) return "segments";
  if (!plan || plan.status !== "approved") return "plan";
  if (progress.hasSent) return "needs";
  if (progress.sequencesCreated) return "emails";
  return "find";
}

function asOpsStep(focus: SalesGuidedStep | null | undefined): OpsStep | null {
  return focus && focus !== "confirm" ? focus : null;
}

interface GeneratedPlan {
  plan: SalesPlan;
  source: PlanSource | null;
  note: string | null;
}

export default function SalesPanel({
  sessionDbId,
  config,
  dossier,
  domain,
  goals,
  focusStep,
  onSetup,
  onCreateDistribution,
}: SalesPanelProps) {
  const planQuery = useApi<{ plan: SalesPlan | null }>(
    config && sessionDbId ? withQuery("/api/sales/plan", { session_id: sessionDbId }) : null,
  );
  const [generated, setGenerated] = useState<GeneratedPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingPaused, setPendingPaused] = useState<boolean | null>(null);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<OpsStep | null>(asOpsStep(focusStep));
  const [lastFocus, setLastFocus] = useState(focusStep);
  const [showMore, setShowMore] = useState(false);
  const [progress, setProgress] = useState<Progress>({ sequencesCreated: false, hasSent: false });

  // A new guided focus from the shell (Kami Guide / overview) moves the founder there.
  if (focusStep !== lastFocus) {
    setLastFocus(focusStep);
    const next = asOpsStep(focusStep);
    if (next) setChosen(next);
  }

  const plan = generated?.plan ?? planQuery.data?.plan ?? null;
  const segments = (config?.segments as SalesSegment[] | null | undefined) ?? null;
  const paused = pendingPaused ?? config?.autonomous_paused ?? false;
  const segmentsConfirmed = Boolean(config?.segments_confirmed_at);
  const planApproved = plan?.status === "approved";

  const stepDone: Record<OpsStep, boolean> = {
    segments: segmentsConfirmed,
    plan: planApproved,
    find: progress.sequencesCreated,
    emails: progress.hasSent,
    needs: progress.hasSent,
  };

  function canVisit(key: OpsStep): boolean {
    if (key === "segments") return true;
    if (!segmentsConfirmed) return false;
    if (key === "plan") return true;
    if (!planApproved) return false;
    if (key === "find") return true;
    if (key === "emails") return progress.sequencesCreated;
    return progress.sequencesCreated || progress.hasSent;
  }

  const step: OpsStep = !segmentsConfirmed
    ? "segments"
    : chosen && canVisit(chosen)
      ? chosen
      : defaultOpsStep(config, plan, progress);

  async function handleSegmentsConfirmed(next: SalesSegment[]) {
    if (config) {
      onSetup({ ...config, segments: next, segments_confirmed_at: new Date().toISOString() });
    }
    setChosen("plan");
    if (!sessionDbId) return;
    setPlanError(null);
    try {
      const json = await api.post<{ plan: SalesPlan; source?: PlanSource; note?: string | null }>(
        "/api/sales/plan",
        { session_id: sessionDbId, action: "generate" },
      );
      setGenerated({ plan: json.plan, source: json.source ?? null, note: json.note ?? null });
    } catch (err) {
      setPlanError(errorMessage(err, "Could not build the plan"));
    }
  }

  async function handlePauseChange(nextPaused: boolean) {
    if (!sessionDbId || !config) return;
    setPendingPaused(nextPaused);
    setPauseError(null);
    try {
      const json = await api.patch<{ config: SalesCampaignConfig }>("/api/sales/setup", {
        session_id: sessionDbId,
        autonomous_paused: nextPaused,
      });
      onSetup({ ...config, autonomous_paused: json.config.autonomous_paused });
    } catch (err) {
      setPauseError(errorMessage(err, "Could not change the pause"));
    } finally {
      setPendingPaused(null);
    }
  }

  if (!config || showSettings) {
    return (
      <SalesSetup
        key={showSettings ? `edit-${config?.updated_at ?? ""}` : "new"}
        sessionDbId={sessionDbId}
        dossier={dossier}
        domain={domain}
        goals={goals}
        existingConfig={showSettings ? config : null}
        onComplete={(c) => {
          onSetup(c);
          setShowSettings(false);
          setGenerated(null);
          setChosen("segments");
          planQuery.reload();
        }}
      />
    );
  }

  if (!sessionDbId) {
    return (
      <p className="form-error" role="alert">
        Session not ready — wait for Overview research to finish before outbound.
      </p>
    );
  }

  return (
    <div className="sales-panel">
      <div className="sales-panel-head">
        <p className="label-caps">Outbound sales</p>
        <div className="sales-panel-actions">
          <button
            type="button"
            className="btn-outline"
            onClick={() => setShowSettings(true)}
            title="Edit who and what"
            aria-label="Edit who and what"
          >
            ⚙
          </button>
          <KillSwitch
            paused={paused}
            onChange={handlePauseChange}
            disabled={pendingPaused !== null}
          />
        </div>
      </div>
      {pauseError && (
        <p className="form-error" role="alert">
          {pauseError}
        </p>
      )}
      <hr className="crease" />

      <nav className="sales-stepper" aria-label="Sales progress">
        {OPS_STEPS.map((s) => {
          const done = stepDone[s.key];
          const active = step === s.key;
          const unlocked = canVisit(s.key);
          return (
            <button
              key={s.key}
              type="button"
              className="sales-step"
              data-active={active}
              data-done={done && !active}
              data-blocked={!segmentsConfirmed && s.key === "segments"}
              aria-current={active ? "step" : undefined}
              onClick={() => unlocked && setChosen(s.key)}
              disabled={!unlocked}
            >
              {done && !active ? "✓ " : ""}
              {s.label}
            </button>
          );
        })}
      </nav>

      {step === "segments" && (
        <SegmentConfirm sessionDbId={sessionDbId} onConfirmed={handleSegmentsConfirmed} />
      )}

      {step === "plan" && (
        <>
          {(planError || planQuery.error) && (
            <p className="form-error" role="alert">
              {planError ?? planQuery.error}
            </p>
          )}
          <SalesPlanView
            sessionDbId={sessionDbId}
            plan={plan}
            offer={config.offer}
            segments={segments}
            planSource={generated?.source ?? null}
            planNote={generated?.note ?? null}
            onApproved={(p) => {
              setGenerated((g) => ({ plan: p, source: g?.source ?? null, note: g?.note ?? null }));
              setChosen("find");
            }}
            onRevised={(p, meta) =>
              setGenerated({ plan: p, source: meta?.source ?? null, note: meta?.note ?? null })
            }
          />
        </>
      )}

      {step === "find" && planApproved && (
        <SalesTargetReview
          sessionDbId={sessionDbId}
          plan={plan}
          offer={config.offer}
          segments={segments}
          paused={paused}
          onContinue={() => {
            setProgress((p) => ({ ...p, sequencesCreated: true }));
            setChosen("emails");
          }}
          onCreateDistribution={onCreateDistribution}
        />
      )}

      {step === "emails" && planApproved && (
        <SalesDraftQueue
          sessionDbId={sessionDbId}
          paused={paused}
          onSent={() => {
            setProgress((p) => ({ ...p, hasSent: true }));
            setChosen("needs");
          }}
        />
      )}

      {step === "needs" && planApproved && <SalesNeedsYou sessionDbId={sessionDbId} />}

      {planApproved && (progress.hasSent || showMore) && (
        <div className="sales-more">
          <button
            type="button"
            className="btn-outline"
            onClick={() => setShowMore(!showMore)}
            aria-expanded={showMore}
          >
            {showMore ? "Hide More" : "More — Pipeline, Inbox, Meetings, Tasks"}
          </button>
          {showMore && (
            <>
              <SalesPipeline sessionDbId={sessionDbId} />
              <SalesInbox sessionDbId={sessionDbId} />
              <MeetingQueue sessionDbId={sessionDbId} />
              <SalesTaskBoard sessionDbId={sessionDbId} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
