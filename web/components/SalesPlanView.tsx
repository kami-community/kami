"use client";

import { useState } from "react";
import RecommendationCard from "@/components/bui/RecommendationCard";
import TaskRows from "@/components/bui/TaskRows";
import AgentWait from "@/components/sales/AgentWait";
import SalesFunnel from "@/components/SalesFunnel";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import Disclosure from "@/components/ui/Disclosure";
import EmptyState from "@/components/ui/EmptyState";
import Field, { Input } from "@/components/ui/Field";
import { IconDoc, IconWarning } from "@/components/ui/icons";
import { Section } from "@/components/ui/Page";
import { ValuePill } from "@/components/ui/Pills";
import Skeleton from "@/components/ui/Skeleton";
import { api, errorMessage } from "@/lib/client/api";
import type { SalesSegment } from "@/lib/domain/segments";
import { channelLabel, motionLabel } from "@/lib/salesMotionLabels";
import type { SalesPlan } from "@/lib/salesTypes";

export type PlanSource = "hermes" | "offline_fallback" | "client";

interface SalesPlanViewProps {
  sessionDbId: string;
  plan: SalesPlan | null;
  /** the stored plan is still loading */
  loading: boolean;
  /** the sales strategist is writing a new plan (started by the parent) */
  generating: boolean;
  error: string | null;
  offer?: string;
  segments?: SalesSegment[] | null;
  planSource?: PlanSource | null;
  planNote?: string | null;
  onApproved: (plan: SalesPlan) => void;
  onRevised: (plan: SalesPlan, meta?: { source?: PlanSource; note?: string | null }) => void;
  /** write a plan when none exists */
  onGenerate: () => void;
  /** after an error: reload or write again, whichever failed */
  onRetry: () => void;
}

const PLAN_STAGES = [
  "Reading who you sell to",
  "Choosing how to reach them",
  "Sizing a small first batch",
  "Listing what could go wrong",
];

type PlanResponse = { plan: SalesPlan; source?: PlanSource; note?: string | null };

/** Plan: one decision (approve the plan), with the detail behind a disclosure. */
export default function SalesPlanView({
  sessionDbId,
  plan,
  loading,
  generating,
  error,
  offer,
  segments,
  planSource = null,
  planNote = null,
  onApproved,
  onRevised,
  onGenerate,
  onRetry,
}: SalesPlanViewProps) {
  const [reviseNote, setReviseNote] = useState("");
  const [revising, setRevising] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (generating || revising) {
    return (
      <AgentWait
        agent="sales-strategist"
        doing={revising ? "is rewriting your plan" : "is writing your plan"}
        stages={PLAN_STAGES}
        note="Usually under a minute."
      />
    );
  }

  if (!plan) {
    if (loading) return <Skeleton title lines={5} />;
    if (error) {
      return (
        <Callout
          tone="error"
          title="The plan didn’t come back"
          actions={
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          }
        >
          {error}
        </Callout>
      );
    }
    return (
      <EmptyState
        title="No plan yet"
        icon={<IconDoc size={16} />}
        action={
          <Button variant="accent" size="sm" onClick={onGenerate}>
            Write my plan
          </Button>
        }
      >
        The sales strategist turns who you sell to into a small first batch for you to approve.
      </EmptyState>
    );
  }

  const current = plan;
  const accounts = plan.estimated_activity?.accounts_to_research ?? null;
  const sends = plan.estimated_activity?.sends_per_week ?? null;
  const approved = plan.status === "approved";
  const offline = (planSource ?? plan.source) === "offline_fallback";
  const risks = plan.risks ?? [];

  async function approve() {
    if (!current.id)
      throw new Error("This plan has no id yet. Ask for changes to write a new one.");
    const { plan: next } = await api.post<PlanResponse>("/api/sales/plan", {
      session_id: sessionDbId,
      action: "approve",
      plan_id: current.id,
    });
    onApproved(next);
  }

  async function revise() {
    if (!reviseNote.trim()) return;
    setRevising(true);
    setActionError(null);
    try {
      const json = await api.post<PlanResponse>("/api/sales/plan", {
        session_id: sessionDbId,
        action: "generate",
        revise_note: reviseNote.trim(),
      });
      setReviseNote("");
      onRevised(json.plan, { source: json.source, note: json.note ?? null });
    } catch (err) {
      setActionError(errorMessage(err, "Could not rewrite the plan"));
    } finally {
      setRevising(false);
    }
  }

  const offlineNote = planNote ?? plan.revise_note;

  return (
    <div className="stack stack--lg">
      {offline && (
        <Callout tone="warn" title="This is a starter plan">
          {offlineNote ? `${offlineNote}. ` : ""}Kami’s agents were offline, so this plan wasn’t
          researched. Start Hermes, then ask for changes to get a researched plan.
        </Callout>
      )}

      <RecommendationCard
        className="sales-plan__reco"
        title={approved ? "Plan approved" : "Approve this plan?"}
        options={[
          {
            key: "plan",
            short: "This plan",
            body: (
              <>
                Kami will research{" "}
                {accounts != null ? (
                  <ValuePill tone="accent">about {accounts} companies</ValuePill>
                ) : (
                  "matching companies"
                )}
                , then draft up to{" "}
                {sends != null ? (
                  <ValuePill>{sends} emails a week</ValuePill>
                ) : (
                  "a small weekly batch"
                )}
                . Nothing sends until you approve each email.
              </>
            ),
            confidence: offline
              ? { signal: 1, label: "Starter plan" }
              : {
                  signal: risks.length ? 2 : 3,
                  label: risks.length
                    ? `${risks.length} thing${risks.length === 1 ? "" : "s"} to know`
                    : "Looks solid",
                },
            cta: approved ? "Find companies" : "Approve plan",
            onAccept: approved ? async () => onApproved(current) : approve,
          },
        ]}
        labels={{ accepted: approved ? "Opening…" : "Approved" }}
        footer={
          !approved ? (
            <div className="reco__revise">
              <Field label="Ask for changes" optional hideLabel>
                <Input
                  size="sm"
                  value={reviseNote}
                  onChange={(e) => setReviseNote(e.target.value)}
                  placeholder="Want changes? e.g. fintech only, fewer companies…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && reviseNote.trim()) void revise();
                  }}
                />
              </Field>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void revise()}
                disabled={!reviseNote.trim()}
              >
                Rewrite
              </Button>
            </div>
          ) : null
        }
      />
      {actionError && (
        <p className="field__error" role="alert">
          {actionError}
        </p>
      )}

      {risks.length > 0 && (
        <Section title="Worth knowing" desc="So you can decide with eyes open.">
          <Card>
            <ul className="risk-list">
              {risks.map((r, i) => (
                <li key={i}>
                  <IconWarning size={13} className="sales-plan__risk-icon" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      <Disclosure label="How Kami will work">
        <div className="stack stack--lg sales-plan__details">
          {offer && (
            <p className="text-2 text-sm">
              <span className="text-ink">Selling:</span> {offer}
            </p>
          )}
          <SalesFunnel segments={segments} plan={plan} show="budgets" />
          {plan.motions.length > 0 && (
            <div className="stack stack--sm">
              <p className="group-label">How Kami reaches them</p>
              {plan.channel_rationale && <p className="text-2 text-sm">{plan.channel_rationale}</p>}
              <TaskRows
                variant="List"
                rows={plan.motions.map((m, i) => ({
                  key: `${m.motion}-${i}`,
                  label: motionLabel(m.motion),
                  amount: channelLabel(m.primary_channel),
                  status: approved ? "done" : "pending",
                  step: i + 1,
                  pill: null,
                  details: [{ label: m.rationale }],
                }))}
              />
            </div>
          )}
          {plan.tiers.length > 0 && (
            <div className="stack stack--sm">
              <p className="group-label">Who comes first</p>
              <ol className="sales-plan__order">
                {plan.tiers.map((t) => (
                  <li key={t.tier}>
                    <span className="text-ink">{t.label}</span>
                    <span className="text-3 tabular"> · about {t.target_count}</span>
                    <p className="text-2 text-sm">{t.criteria}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </Disclosure>
    </div>
  );
}
