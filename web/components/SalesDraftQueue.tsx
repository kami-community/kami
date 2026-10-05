"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReviewerVerdict } from "@/lib/salesTypes";
import { api, errorMessage } from "@/lib/client/api";

interface DraftRow {
  id: string;
  step: number;
  status: string;
  draft_subject?: string;
  draft_body?: string;
  draft_cta?: string;
  reviewer_verdict?: ReviewerVerdict;
  approved_at?: string;
  sent_at?: string;
  sales_sequence_enrollments?: {
    status: string;
    sales_contacts?: { name?: string; email?: string };
    sales_accounts?: { name?: string; domain?: string };
  };
}

interface SalesDraftQueueProps {
  sessionDbId: string | null;
  paused?: boolean;
  onSent?: () => void;
}

const HYBRID_INDIVIDUAL_CAP = 3;

export default function SalesDraftQueue({ sessionDbId, paused, onSent }: SalesDraftQueueProps) {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsFirstSendApproval, setNeedsFirstSendApproval] = useState(false);
  const [approving, setApproving] = useState(false);
  const [individualSendCount, setIndividualSendCount] = useState(0);

  const fetchDrafts = useCallback(() => {
    if (!sessionDbId) return;
    setLoading(true);
    fetch(`/api/sales/drafts?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => {
        const rows = j.drafts ?? [];
        setDrafts(rows);
        setIndividualSendCount(rows.filter((d: DraftRow) => d.status === "sent").length);
      })
      .catch(() => setDrafts([]))
      .finally(() => setLoading(false));
  }, [sessionDbId]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  async function approveFirstSend() {
    if (!sessionDbId) return;
    setApproving(true);
    try {
      await api.post("/api/sales/approvals", { session_id: sessionDbId, scope: "first_send" });
      setNeedsFirstSendApproval(false);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Could not record your approval"));
    } finally {
      setApproving(false);
    }
  }

  async function runAction(draftId: string, action: "review" | "approve" | "send") {
    if (!sessionDbId || paused) return;
    setBusyId(draftId);
    setError(null);
    setNeedsFirstSendApproval(false);
    try {
      const res = await fetch("/api/sales/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, touchpoint_id: draftId, session_id: sessionDbId }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json.error ?? `Action ${action} failed`;
        setError(msg);
        if (msg.includes("first send")) setNeedsFirstSendApproval(true);
        return;
      }
      if (action === "send") {
        setIndividualSendCount((c) => c + 1);
        onSent?.();
      }
      fetchDrafts();
    } catch {
      setError(`Action ${action} failed`);
    } finally {
      setBusyId(null);
    }
  }

  async function sendRemainingApproved() {
    if (!sessionDbId || paused) return;
    const toSend = drafts.filter((d) => d.status === "approved");
    if (!toSend.length) return;

    setBatchBusy(true);
    setError(null);
    try {
      for (const draft of toSend) {
        const res = await fetch("/api/sales/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send",
            touchpoint_id: draft.id,
            session_id: sessionDbId,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Batch send stopped on error");
          if ((json.error as string)?.includes("first send")) setNeedsFirstSendApproval(true);
          break;
        }
      }
      onSent?.();
      fetchDrafts();
    } finally {
      setBatchBusy(false);
    }
  }

  const pendingDrafts = drafts.filter((d) => d.status !== "sent");
  const approvedPending = pendingDrafts.filter((d) => d.status === "approved");
  const showBatchSend =
    individualSendCount >= 1 &&
    individualSendCount < HYBRID_INDIVIDUAL_CAP &&
    approvedPending.length > 0;

  const showBatchAfterCap =
    individualSendCount >= HYBRID_INDIVIDUAL_CAP && approvedPending.length > 0;

  return (
    <div className="sales-panel" style={{ marginTop: "var(--stack-md)" }}>
      <p className="sales-intro" style={{ marginBottom: "var(--stack-sm)" }}>
        Review each email before it goes out. Send the first few one-by-one, then batch the rest
        when you&apos;re confident.
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--stack-sm)",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <p className="label-caps">Review emails</p>
        <button
          type="button"
          className="mono"
          onClick={fetchDrafts}
          disabled={!sessionDbId || loading}
          style={{
            border: "1px solid var(--ink)",
            background: "transparent",
            padding: "0.3rem 0.6rem",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          refresh
        </button>
      </div>
      <hr className="crease" />

      {needsFirstSendApproval && (
        <div
          className="kraft-card"
          style={{ padding: "var(--stack-sm)", marginBottom: "var(--stack-sm)" }}
        >
          <p style={{ fontSize: 14, marginBottom: "0.5rem" }}>First send needs your explicit OK.</p>
          <button
            type="button"
            className="hanko-btn"
            onClick={approveFirstSend}
            disabled={approving}
          >
            {approving ? "Saving…" : "Approve first send"}
          </button>
        </div>
      )}

      {error && (
        <p
          className="mono"
          style={{ color: "var(--hanko)", fontSize: 12, marginBottom: "var(--stack-sm)" }}
        >
          {error}
        </p>
      )}

      {!sessionDbId && (
        <p className="mono" style={{ color: "var(--ink-soft)", fontSize: 13 }}>
          Start a session to manage email drafts.
        </p>
      )}

      {sessionDbId && !loading && pendingDrafts.length === 0 && (
        <p className="mono" style={{ color: "var(--ink-soft)", fontSize: 13 }}>
          No drafts yet — finish Find companies and add contact emails first.
        </p>
      )}

      {(showBatchSend || showBatchAfterCap) && (
        <button
          type="button"
          className="hanko-btn"
          onClick={sendRemainingApproved}
          disabled={paused || batchBusy}
          style={{ marginBottom: "var(--stack-md)" }}
        >
          {batchBusy ? "Sending…" : `Send remaining approved (${approvedPending.length})`}
        </button>
      )}

      {pendingDrafts.map((draft) => {
        const contact = draft.sales_sequence_enrollments?.sales_contacts;
        const account = draft.sales_sequence_enrollments?.sales_accounts;
        const verdict = draft.reviewer_verdict;
        const isBusy = busyId === draft.id;
        const hasEmail = Boolean(contact?.email);

        return (
          <div
            key={draft.id}
            className="kraft-card"
            style={{ padding: "var(--stack-md)", marginBottom: "var(--stack-sm)" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "var(--stack-sm)",
                flexWrap: "wrap",
              }}
            >
              <div>
                <p style={{ fontSize: 15, fontWeight: 700 }}>
                  {contact?.name ?? account?.name ?? "Unknown"}
                </p>
                <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {hasEmail ? contact?.email : "No email — go back to Find companies"} · step{" "}
                  {draft.step}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="mono"
                  disabled={paused || isBusy || draft.status === "sent" || !hasEmail}
                  onClick={() => runAction(draft.id, "review")}
                  style={{
                    border: "1px solid var(--ink)",
                    background: "transparent",
                    padding: "0.25rem 0.5rem",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  review
                </button>
                <button
                  type="button"
                  className="mono"
                  disabled={
                    paused ||
                    isBusy ||
                    !verdict?.approved ||
                    draft.status === "approved" ||
                    draft.status === "sent" ||
                    !hasEmail
                  }
                  onClick={() => runAction(draft.id, "approve")}
                  style={{
                    border: "1px solid var(--ink)",
                    background: "transparent",
                    padding: "0.25rem 0.5rem",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  approve
                </button>
                <button
                  type="button"
                  className="hanko-btn"
                  disabled={paused || isBusy || draft.status !== "approved" || !hasEmail}
                  onClick={() => runAction(draft.id, "send")}
                  style={{ padding: "0.25rem 0.65rem", fontSize: 11 }}
                >
                  send
                </button>
              </div>
            </div>

            {draft.draft_subject && (
              <p className="mono" style={{ fontSize: 12, marginTop: "var(--stack-sm)" }}>
                Subject: {draft.draft_subject}
              </p>
            )}

            {draft.draft_body && (
              <pre
                className="mono"
                style={{
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                  marginTop: "var(--stack-sm)",
                  color: "var(--ink-soft)",
                  maxHeight: 160,
                  overflow: "auto",
                }}
              >
                {draft.draft_body}
              </pre>
            )}

            {verdict && (
              <div style={{ marginTop: "var(--stack-sm)" }}>
                <p
                  className="mono"
                  style={{ fontSize: 11, color: verdict.approved ? "var(--ink)" : "var(--hanko)" }}
                >
                  Review: {verdict.approved ? "pass" : "needs fixes"} · score {verdict.score}
                </p>
                {!verdict.approved && verdict.required_fixes.length > 0 && (
                  <ul
                    style={{ margin: "0.25rem 0 0", paddingLeft: "1.2rem", fontSize: 11 }}
                    className="mono"
                  >
                    {verdict.required_fixes.map((fix) => (
                      <li key={fix} style={{ color: "var(--hanko)" }}>
                        {fix}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
