"use client";

import { useEffect, useRef, useState } from "react";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import TaskRows from "@/components/bui/TaskRows";
import Button, { IconButton } from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { IconArrowUpRight, IconClose } from "@/components/ui/icons";
import { humanize, Monogram, StatusPill, statusTone } from "@/components/ui/Pills";
import Skeleton from "@/components/ui/Skeleton";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type {
  AccountSignal,
  LeadScore,
  PipelineStage,
  SalesAccount,
  SalesContact,
  SalesTask,
} from "@/lib/salesTypes";

interface AccountDrawerProps {
  accountId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

interface AccountDetail {
  account: SalesAccount;
  signals: AccountSignal[];
  contacts: SalesContact[];
  lead_score: LeadScore | null;
}

const STAGE_ACTIONS: { stage: PipelineStage; label: string }[] = [
  { stage: "engaged", label: "Replied" },
  { stage: "qualified", label: "Interested" },
  { stage: "closed_lost", label: "Lost" },
  { stage: "suppressed", label: "Do not contact" },
];

/** Account detail in a side sheet (native <dialog>: focus trap, Esc closes). */
export default function AccountDrawer({ accountId, onClose, onUpdated }: AccountDrawerProps) {
  const { sessionId } = useCampaign();
  const ref = useRef<HTMLDialogElement>(null);
  const detail = useApi<AccountDetail>(
    withQuery(`/api/sales/accounts/${accountId}`, { session_id: sessionId }),
  );
  const tasksQuery = useApi<{ tasks: SalesTask[] }>(
    withQuery("/api/sales/tasks", { session_id: sessionId, account_id: accountId }),
  );
  const [stageError, setStageError] = useState<string | null>(null);
  const [saving, setSaving] = useState<PipelineStage | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function updateStage(stage: PipelineStage) {
    setSaving(stage);
    setStageError(null);
    try {
      await api.patch(`/api/sales/accounts/${accountId}`, {
        session_id: sessionId,
        pipeline_stage: stage,
      });
      detail.reload();
      onUpdated?.();
    } catch (err) {
      setStageError(errorMessage(err, "Could not move the account"));
    } finally {
      setSaving(null);
    }
  }

  const data = detail.data;
  const tasks = (tasksQuery.data?.tasks ?? []).filter((t) => t.account_id === accountId);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label="Account details"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet__head">
        {data ? (
          <div className="row sheet__who">
            <Monogram name={data.account.name} shape="square" size="lg" />
            <div className="sheet__who-text">
              <p className="sheet__title truncate">{data.account.name}</p>
              <p className="text-3 text-xs truncate">
                {data.account.domain ?? data.account.industry ?? "—"}
              </p>
            </div>
          </div>
        ) : (
          <span />
        )}
        <IconButton label="Close account details" onClick={onClose}>
          <IconClose size={15} />
        </IconButton>
      </div>

      <div className="sheet__body">
        {!data ? (
          detail.error ? (
            <Callout tone="error">{detail.error}</Callout>
          ) : (
            <Skeleton title lines={6} />
          )
        ) : (
          <>
            <div className="row row--wrap">
              <StatusPill tone={statusTone(data.account.pipeline_stage)}>
                {humanize(data.account.pipeline_stage)}
              </StatusPill>
              {data.account.domain && (
                <a
                  className="records-link"
                  href={`https://${data.account.domain}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {data.account.domain} <IconArrowUpRight size={11} />
                </a>
              )}
            </div>

            {data.lead_score && (
              <section className="sheet__section">
                <p className="sheet__label">Why this company</p>
                <div className="score-bars">
                  {(["fit", "intent", "priority"] as const).map((k) => (
                    <div key={k} className="score-bar">
                      <span className="score-bar__name">
                        {k === "intent" ? "Timing" : humanize(k)}
                      </span>
                      <span className="score-bar__track">
                        {/* the bar width is data, not styling */}
                        <span
                          style={{ width: `${Math.round(data.lead_score!.factors[k] * 100)}%` }}
                        />
                      </span>
                      <span className="score-bar__value tabular">
                        {Math.round(data.lead_score!.factors[k] * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-2 text-sm">{data.lead_score.explanation}</p>
              </section>
            )}

            {data.signals.length > 0 && (
              <section className="sheet__section">
                <p className="sheet__label">Signals</p>
                <ul className="signal-list">
                  {data.signals.slice(0, 6).map((s) => (
                    <li key={s.id ?? s.detail}>
                      <StatusPill dot={false}>{humanize(s.signal_type)}</StatusPill>
                      <span className="text-2 text-sm">{s.detail}</span>
                      {s.source_url && (
                        <a
                          className="records-link"
                          href={s.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          source <IconArrowUpRight size={11} />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.contacts.length > 0 && (
              <section className="sheet__section">
                <p className="sheet__label">Contacts</p>
                <ul className="contact-list">
                  {data.contacts.map((c) => (
                    <li key={c.id}>
                      <Monogram name={c.name ?? c.email ?? "?"} />
                      <span className="truncate">{c.name ?? c.email ?? c.handle}</span>
                      {c.title && <span className="text-3 text-xs truncate">{c.title}</span>}
                      {c.email && c.name && (
                        <span className="text-3 text-xs mono truncate">{c.email}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {tasks.length > 0 && (
              <section className="sheet__section">
                <p className="sheet__label">Tasks</p>
                <TaskRows
                  variant="List"
                  rows={tasks.slice(0, 5).map((t, i) => ({
                    key: t.id ?? `t-${i}`,
                    label: t.title,
                    status: t.status === "done" ? "done" : "pending",
                    step: i + 1,
                    amount: humanize(t.priority),
                    pill: null,
                  }))}
                />
              </section>
            )}

            {stageError && <Callout tone="error">{stageError}</Callout>}
          </>
        )}
      </div>

      {data && (
        <div className="sheet__footer">
          <span className="text-3 text-xs">Move to</span>
          <span className="row row--wrap sheet__moves">
            {STAGE_ACTIONS.filter((s) => s.stage !== data.account.pipeline_stage).map(
              ({ stage, label }) => (
                <Button
                  key={stage}
                  size="xs"
                  variant="secondary"
                  busy={saving === stage}
                  disabled={saving !== null}
                  onClick={() => void updateStage(stage)}
                >
                  {label}
                </Button>
              ),
            )}
          </span>
        </div>
      )}
    </dialog>
  );
}
