"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dossier } from "@/lib/domain/dossier";
import type { SalesCampaignConfig, SalesPlan } from "@/lib/salesTypes";
import type { SalesSegment } from "@/lib/domain/segments";
import SalesSetup from "@/components/SalesSetup";
import SalesPlanView from "@/components/SalesPlanView";
import SalesDraftQueue from "@/components/SalesDraftQueue";
import SalesTargetReview from "@/components/SalesTargetReview";
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

function defaultOpsStep(
  config: SalesCampaignConfig | null,
  plan: SalesPlan | null,
  progress: { sequencesCreated: boolean; hasSent: boolean },
): OpsStep {
  if (!config?.segments_confirmed_at) return "segments";
  if (!plan || plan.status !== "approved") return "plan";
  if (progress.hasSent) return "needs";
  if (progress.sequencesCreated) return "emails";
  return "find";
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
  const [plan, setPlan] = useState<SalesPlan | null>(null);
  const [planSource, setPlanSource] = useState<"hermes" | "offline_fallback" | "client" | null>(
    null,
  );
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [segments, setSegments] = useState<SalesSegment[] | null>(
    (config?.segments as SalesSegment[] | null) ?? null,
  );
  const [showSettings, setShowSettings] = useState(false);
  const [paused, setPaused] = useState(config?.autonomous_paused ?? false);
  const [pauseSaving, setPauseSaving] = useState(false);
  const [step, setStep] = useState<OpsStep>("segments");
  const [showMore, setShowMore] = useState(false);
  const [hasSent, setHasSent] = useState(false);
  const [sequencesCreated, setSequencesCreated] = useState(false);

  const segmentsConfirmed = Boolean(config?.segments_confirmed_at);

  const fetchPlan = useCallback(() => {
    if (!sessionDbId) return;
    fetch(`/api/sales/plan?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => {
        const p = j.plan ?? null;
        setPlan(p);
      })
      .catch(() => {});
  }, [sessionDbId]);

  useEffect(() => {
    setPaused(config?.autonomous_paused ?? false);
    if (config?.segments) setSegments(config.segments as SalesSegment[]);
  }, [config?.autonomous_paused, config?.segments]);

  // Always land on Confirm ICP until segments_confirmed_at is set in the DB.
  // Do not yank the founder backward once they have advanced past plan/find.
  useEffect(() => {
    if (!config) return;
    fetchPlan();
    if (!config.segments_confirmed_at) {
      setStep("segments");
    }
  }, [config?.session_id, config?.segments_confirmed_at, fetchPlan]);

  useEffect(() => {
    if (!config?.segments_confirmed_at || !plan) return;
    if (focusStep === "find" || focusStep === "emails" || focusStep === "needs") return;
    setStep((prev) => {
      const next = defaultOpsStep(config, plan, { sequencesCreated, hasSent });
      const order: OpsStep[] = ["segments", "plan", "find", "emails", "needs"];
      // Never move the founder backward on a config/plan refresh.
      if (order.indexOf(prev) > order.indexOf(next)) return prev;
      return next;
    });
  }, [plan?.status, plan?.id, config?.segments_confirmed_at, focusStep, sequencesCreated, hasSent]);

  useEffect(() => {
    if (!focusStep || focusStep === "confirm") return;
    if (!config?.segments_confirmed_at) {
      setStep("segments");
      return;
    }
    if (focusStep === "segments") setStep("segments");
    else if (
      focusStep === "plan" ||
      focusStep === "find" ||
      focusStep === "emails" ||
      focusStep === "needs"
    ) {
      setStep(focusStep);
    }
  }, [focusStep, config?.segments_confirmed_at]);

  const planApproved = plan?.status === "approved";

  const stepDone = useMemo(
    () => ({
      segments: segmentsConfirmed,
      plan: planApproved,
      find: sequencesCreated,
      emails: hasSent,
      needs: hasSent,
    }),
    [segmentsConfirmed, planApproved, sequencesCreated, hasSent],
  );

  function canVisit(key: OpsStep): boolean {
    if (key === "segments") return true;
    if (key === "plan") return segmentsConfirmed;
    if (key === "find") return segmentsConfirmed && planApproved;
    if (key === "emails") return segmentsConfirmed && planApproved && sequencesCreated;
    if (key === "needs") return segmentsConfirmed && planApproved && (sequencesCreated || hasSent);
    return false;
  }

  async function handleSegmentsConfirmed(next: SalesSegment[]) {
    setSegments(next);
    if (config) {
      onSetup({
        ...config,
        segments: next,
        segments_confirmed_at: new Date().toISOString(),
      });
    }
    if (sessionDbId) {
      const res = await fetch("/api/sales/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionDbId }),
      });
      const json = await res.json();
      if (res.ok && json.plan) {
        setPlan(json.plan);
        setPlanSource(json.source ?? null);
        setPlanNote(json.note ?? null);
      } else fetchPlan();
    }
    setStep("plan");
  }

  async function handlePauseChange(nextPaused: boolean) {
    if (!sessionDbId) return;
    setPaused(nextPaused);
    setPauseSaving(true);
    try {
      const res = await fetch("/api/sales/setup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionDbId, autonomous_paused: nextPaused }),
      });
      const json = await res.json();
      if (res.ok && json.config && config) {
        onSetup({ ...config, autonomous_paused: json.config.autonomous_paused });
      }
    } catch {
      setPaused(!nextPaused);
    } finally {
      setPauseSaving(false);
    }
  }

  if (!config || showSettings) {
    return (
      <SalesSetup
        sessionDbId={sessionDbId}
        dossier={dossier}
        domain={domain}
        goals={goals}
        existingConfig={showSettings ? config : null}
        onComplete={(c) => {
          onSetup(c);
          setShowSettings(false);
          setStep("segments");
        }}
      />
    );
  }

  if (!sessionDbId) {
    return (
      <p className="mono" style={{ color: "var(--hanko)", padding: "var(--stack-md)" }}>
        Session not ready — wait for Overview research to finish before outbound.
      </p>
    );
  }

  // Hard gate: until DB has segments_confirmed_at, only show Confirm ICP (no Find UI).
  if (!segmentsConfirmed) {
    return (
      <div className="sales-panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--stack-sm)",
          }}
        >
          <p className="label-caps">Outbound sales</p>
          <div style={{ display: "flex", gap: "var(--stack-sm)", alignItems: "center" }}>
            <button
              type="button"
              className="mono"
              onClick={() => setShowSettings(true)}
              style={{
                border: "1px solid var(--ink)",
                background: "transparent",
                padding: "0.3rem 0.6rem",
                cursor: "pointer",
                fontSize: 12,
              }}
              title="Edit who and what"
            >
              ⚙
            </button>
            <KillSwitch
              paused={paused}
              onChange={handlePauseChange}
              disabled={pauseSaving || !sessionDbId}
            />
          </div>
        </div>
        <hr className="crease" />
        <nav className="sales-stepper" aria-label="Sales progress">
          {OPS_STEPS.map((s) => {
            const unlocked = canVisit(s.key);
            const active = s.key === "segments";
            return (
              <button
                key={s.key}
                type="button"
                className="sales-step"
                data-active={active}
                data-blocked={s.key === "segments"}
                onClick={() => unlocked && setStep(s.key)}
                disabled={!unlocked}
              >
                {s.label}
              </button>
            );
          })}
        </nav>
        <SegmentConfirm sessionDbId={sessionDbId} onConfirmed={handleSegmentsConfirmed} />
      </div>
    );
  }

  return (
    <div className="sales-panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--stack-sm)",
        }}
      >
        <p className="label-caps">Outbound sales</p>
        <div style={{ display: "flex", gap: "var(--stack-sm)", alignItems: "center" }}>
          <button
            type="button"
            className="mono"
            onClick={() => setShowSettings(true)}
            style={{
              border: "1px solid var(--ink)",
              background: "transparent",
              padding: "0.3rem 0.6rem",
              cursor: "pointer",
              fontSize: 12,
            }}
            title="Edit who and what"
          >
            ⚙
          </button>
          <KillSwitch
            paused={paused}
            onChange={handlePauseChange}
            disabled={pauseSaving || !sessionDbId}
          />
        </div>
      </div>
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
              onClick={() => unlocked && setStep(s.key)}
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
        <SalesPlanView
          sessionDbId={sessionDbId}
          plan={plan}
          offer={config.offer}
          segments={segments}
          planSource={planSource}
          planNote={planNote}
          onApproved={(p) => {
            setPlan(p);
            setStep("find");
          }}
          onRevised={(p, meta) => {
            setPlan(p);
            if (meta?.source) setPlanSource(meta.source);
            if (meta?.note !== undefined) setPlanNote(meta.note ?? null);
          }}
        />
      )}

      {step === "find" && planApproved && (
        <SalesTargetReview
          sessionDbId={sessionDbId}
          plan={plan}
          offer={config.offer}
          segments={segments}
          paused={paused}
          onContinue={() => {
            setSequencesCreated(true);
            setStep("emails");
          }}
          onCreateDistribution={onCreateDistribution}
        />
      )}

      {step === "emails" && planApproved && (
        <SalesDraftQueue
          sessionDbId={sessionDbId}
          paused={paused}
          onSent={() => {
            setHasSent(true);
            setStep("needs");
          }}
        />
      )}

      {step === "needs" && planApproved && <SalesNeedsYou sessionDbId={sessionDbId} />}

      {planApproved && (hasSent || showMore) && (
        <div style={{ marginTop: "var(--stack-lg)" }}>
          <button
            type="button"
            className="mono"
            onClick={() => setShowMore(!showMore)}
            style={{
              border: "1px solid var(--outline)",
              background: "transparent",
              padding: "0.35rem 0.65rem",
              cursor: "pointer",
              fontSize: 11,
              marginBottom: "var(--stack-sm)",
            }}
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
