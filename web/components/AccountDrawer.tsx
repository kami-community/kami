"use client";

import { useState } from "react";
import { useCampaign } from "@/components/campaign/CampaignProvider";
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

const STAGE_ACTIONS: PipelineStage[] = ["engaged", "qualified", "closed_lost", "suppressed"];

export default function AccountDrawer({ accountId, onClose, onUpdated }: AccountDrawerProps) {
  const { sessionId } = useCampaign();
  const detail = useApi<AccountDetail>(
    withQuery(`/api/sales/accounts/${accountId}`, { session_id: sessionId }),
  );
  const tasksQuery = useApi<{ tasks: SalesTask[] }>(
    withQuery("/api/sales/tasks", { session_id: sessionId, account_id: accountId }),
  );
  const [stageError, setStageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function updateStage(stage: PipelineStage) {
    setSaving(true);
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
      setSaving(false);
    }
  }

  if (!detail.data) {
    return (
      <div className="kraft-card account-drawer">
        {detail.error ? (
          <p className="form-error" role="alert">
            {detail.error}
          </p>
        ) : (
          <p className="mono muted">Loading account…</p>
        )}
      </div>
    );
  }

  const { account, signals, contacts, lead_score: leadScore } = detail.data;
  const tasks = (tasksQuery.data?.tasks ?? []).filter((t) => t.account_id === accountId);

  return (
    <div className="kraft-card account-drawer">
      <div className="account-drawer__head">
        <div>
          <p className="account-drawer__name">{account.name}</p>
          <p className="mono muted account-drawer__meta">
            {account.domain ?? account.industry ?? "—"} ·{" "}
            {account.pipeline_stage.replace(/_/g, " ")}
            {account.tier ? ` · Tier ${account.tier}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="btn-outline"
          onClick={onClose}
          aria-label="Close account details"
        >
          ✕
        </button>
      </div>

      <hr className="crease" />

      {leadScore && (
        <section className="account-drawer__section">
          <p className="label-caps">Score</p>
          <p className="mono">
            fit {leadScore.factors.fit} · intent {leadScore.factors.intent} · priority{" "}
            {leadScore.factors.priority}
          </p>
          <p>{leadScore.explanation}</p>
        </section>
      )}

      {signals.length > 0 && (
        <section className="account-drawer__section">
          <p className="label-caps">Signals</p>
          {signals.slice(0, 5).map((s) => (
            <div key={s.id}>
              <span className="mono account-drawer__signal-type">{s.signal_type}</span>
              <p>{s.detail}</p>
            </div>
          ))}
        </section>
      )}

      {contacts.length > 0 && (
        <section className="account-drawer__section">
          <p className="label-caps">Contacts</p>
          {contacts.map((c) => (
            <p key={c.id} className="mono">
              {c.name ?? c.email ?? c.handle} {c.title ? `· ${c.title}` : ""}
            </p>
          ))}
        </section>
      )}

      {tasks.length > 0 && (
        <section className="account-drawer__section">
          <p className="label-caps">Tasks</p>
          {tasks.slice(0, 3).map((t) => (
            <p key={t.id} className="mono">
              {t.status === "done" ? "✓" : "○"} {t.title}
            </p>
          ))}
        </section>
      )}

      {stageError && (
        <p className="form-error" role="alert">
          {stageError}
        </p>
      )}
      <div className="account-drawer__actions">
        {STAGE_ACTIONS.map((stage) => (
          <button
            key={stage}
            type="button"
            className="btn-outline"
            disabled={saving}
            onClick={() => updateStage(stage)}
          >
            → {stage.replace(/_/g, " ")}
          </button>
        ))}
      </div>
    </div>
  );
}
