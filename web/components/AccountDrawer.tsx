"use client";

import { useCallback, useEffect, useState } from "react";
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

export default function AccountDrawer({ accountId, onClose, onUpdated }: AccountDrawerProps) {
  const [account, setAccount] = useState<SalesAccount | null>(null);
  const [signals, setSignals] = useState<AccountSignal[]>([]);
  const [contacts, setContacts] = useState<SalesContact[]>([]);
  const [leadScore, setLeadScore] = useState<LeadScore | null>(null);
  const [tasks, setTasks] = useState<SalesTask[]>([]);

  const fetchDetail = useCallback(() => {
    fetch(`/api/sales/accounts/${accountId}`)
      .then((r) => r.json())
      .then((j) => {
        setAccount(j.account ?? null);
        setSignals(j.signals ?? []);
        setContacts(j.contacts ?? []);
        setLeadScore(j.lead_score ?? null);
        const sessionId = j.account?.session_id;
        if (sessionId) {
          fetch(`/api/sales/tasks?session_id=${sessionId}`)
            .then((r) => r.json())
            .then((t) =>
              setTasks((t.tasks ?? []).filter((task: SalesTask) => task.account_id === accountId)),
            )
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [accountId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  async function updateStage(stage: PipelineStage) {
    const res = await fetch(`/api/sales/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_stage: stage }),
    });
    if (res.ok) {
      fetchDetail();
      onUpdated?.();
    }
  }

  if (!account) {
    return (
      <div
        className="kraft-card"
        style={{ marginTop: "var(--stack-sm)", padding: "var(--stack-sm)" }}
      >
        <p className="mono" style={{ color: "var(--ink-soft)" }}>
          Loading account…
        </p>
      </div>
    );
  }

  return (
    <div
      className="kraft-card"
      style={{ marginTop: "var(--stack-sm)", padding: "var(--stack-sm)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: 0 }}>
            {account.name}
          </p>
          <p
            className="mono"
            style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: "0.25rem" }}
          >
            {account.domain ?? account.industry ?? "—"} ·{" "}
            {account.pipeline_stage.replace(/_/g, " ")}
            {account.tier ? ` · Tier ${account.tier}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="mono"
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      <hr className="crease" style={{ margin: "var(--stack-sm) 0" }} />

      {leadScore && (
        <div style={{ marginBottom: "var(--stack-sm)" }}>
          <p className="label-caps" style={{ marginBottom: "0.25rem" }}>
            Score
          </p>
          <p className="mono" style={{ fontSize: 12 }}>
            fit {leadScore.factors.fit} · intent {leadScore.factors.intent} · priority{" "}
            {leadScore.factors.priority}
          </p>
          <p style={{ fontSize: 13, marginTop: "0.25rem" }}>{leadScore.explanation}</p>
        </div>
      )}

      {signals.length > 0 && (
        <div style={{ marginBottom: "var(--stack-sm)" }}>
          <p className="label-caps" style={{ marginBottom: "0.25rem" }}>
            Signals
          </p>
          {signals.slice(0, 5).map((s) => (
            <div key={s.id} style={{ marginBottom: "0.35rem" }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--moss)" }}>
                {s.signal_type}
              </span>
              <p style={{ fontSize: 13, margin: "0.1rem 0 0" }}>{s.detail}</p>
            </div>
          ))}
        </div>
      )}

      {contacts.length > 0 && (
        <div style={{ marginBottom: "var(--stack-sm)" }}>
          <p className="label-caps" style={{ marginBottom: "0.25rem" }}>
            Contacts
          </p>
          {contacts.map((c) => (
            <p key={c.id} className="mono" style={{ fontSize: 12, margin: "0.15rem 0" }}>
              {c.name ?? c.email ?? c.handle} {c.title ? `· ${c.title}` : ""}
            </p>
          ))}
        </div>
      )}

      {tasks.length > 0 && (
        <div style={{ marginBottom: "var(--stack-sm)" }}>
          <p className="label-caps" style={{ marginBottom: "0.25rem" }}>
            Tasks
          </p>
          {tasks.slice(0, 3).map((t) => (
            <p key={t.id} className="mono" style={{ fontSize: 12, margin: "0.15rem 0" }}>
              {t.status === "done" ? "✓" : "○"} {t.title}
            </p>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        {(["engaged", "qualified", "closed_lost", "suppressed"] as PipelineStage[]).map((stage) => (
          <button
            key={stage}
            type="button"
            className="mono"
            onClick={() => updateStage(stage)}
            style={{
              border: "1px solid var(--ink)",
              background: "transparent",
              padding: "0.2rem 0.5rem",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            → {stage.replace(/_/g, " ")}
          </button>
        ))}
      </div>
    </div>
  );
}
