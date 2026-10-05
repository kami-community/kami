"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import DraftCard, { type DraftAction, type DraftRow } from "@/components/sales/DraftCard";
import Callout from "@/components/ui/Callout";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { api, ApiError, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";

interface SalesDraftQueueProps {
  sessionDbId: string | null;
  paused?: boolean;
  onSent?: () => void;
}

/** After this many one-by-one sends, the founder can batch-send the rest. */
const INDIVIDUAL_SENDS_BEFORE_BATCH = 1;

/**
 * Review emails: each draft moves check → approve → send, one step at a time.
 * The first sends go one by one; after that the rest can be sent together.
 */
export default function SalesDraftQueue({
  sessionDbId,
  paused = false,
  onSent,
}: SalesDraftQueueProps) {
  const query = useApi<{ drafts: DraftRow[] }>(
    sessionDbId
      ? withQuery("/api/sales/drafts", { session_id: sessionDbId, status: undefined })
      : null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsFirstSendApproval, setNeedsFirstSendApproval] = useState(false);
  const [approving, setApproving] = useState(false);
  const [confirmSend, setConfirmSend] = useState<DraftRow | null>(null);
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [sentThisVisit, setSentThisVisit] = useState(0);

  const drafts = (query.data?.drafts ?? []).filter((d) => d.status !== "sent");
  const approved = drafts.filter((d) => d.status === "approved");
  const canBatch = sentThisVisit >= INDIVIDUAL_SENDS_BEFORE_BATCH && approved.length > 1;

  function fail(err: unknown, fallback: string) {
    const message = errorMessage(err, fallback);
    setError(message);
    if (err instanceof ApiError && /first send/i.test(message)) setNeedsFirstSendApproval(true);
  }

  async function act(draft: DraftRow, action: DraftAction) {
    if (!sessionDbId) return;
    setBusyId(draft.id);
    setError(null);
    try {
      await api.post("/api/sales/drafts", {
        action,
        touchpoint_id: draft.id,
        session_id: sessionDbId,
      });
      if (action === "send") {
        setSentThisVisit((n) => n + 1);
        onSent?.();
      }
      query.reload();
    } catch (err) {
      fail(err, `Could not ${action} the draft`);
    } finally {
      setBusyId(null);
    }
  }

  async function save(draft: DraftRow, edits: { subject: string; body: string }) {
    if (!sessionDbId) return false;
    setBusyId(draft.id);
    setError(null);
    try {
      await api.post("/api/sales/drafts", {
        action: "edit",
        touchpoint_id: draft.id,
        session_id: sessionDbId,
        ...edits,
      });
      await api.post("/api/sales/drafts", {
        action: "review",
        touchpoint_id: draft.id,
        session_id: sessionDbId,
      });
      query.reload();
      return true;
    } catch (err) {
      fail(err, "Could not save the draft");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function sendAllApproved() {
    setConfirmBatch(false);
    for (const draft of approved) {
      setBusyId(draft.id);
      try {
        await api.post("/api/sales/drafts", {
          action: "send",
          touchpoint_id: draft.id,
          session_id: sessionDbId,
        });
        setSentThisVisit((n) => n + 1);
      } catch (err) {
        fail(err, "Sending stopped");
        break;
      }
    }
    setBusyId(null);
    onSent?.();
    query.reload();
  }

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

  return (
    <section className="draft-queue">
      <div className="section-head">
        <div>
          <p className="label-caps">Review emails</p>
          <p className="muted">
            Check each draft, approve it, then send. Send the first one yourself; after that you can
            send the rest together.
          </p>
        </div>
        {canBatch && (
          <button
            type="button"
            className="hanko-btn"
            onClick={() => setConfirmBatch(true)}
            disabled={paused || Boolean(busyId)}
          >
            Send {approved.length} approved
          </button>
        )}
      </div>

      {paused && (
        <Callout tone="warn">Sending is paused. Resume from the kill switch to send.</Callout>
      )}

      {needsFirstSendApproval && (
        <Callout tone="warn">
          <p>The first email of this campaign needs your explicit go-ahead.</p>
          <button
            type="button"
            className="btn-secondary callout__action"
            onClick={approveFirstSend}
            disabled={approving}
          >
            {approving ? "Saving…" : "Approve the first send"}
          </button>
        </Callout>
      )}

      {(error ?? query.error) && <Callout tone="error">{error ?? query.error}</Callout>}

      {query.loading && !query.data && <Skeleton title lines={4} />}

      {sessionDbId && query.data && drafts.length === 0 && (
        <EmptyState title="No drafts waiting">
          Drafts appear here once companies have a verified contact and you create emails for them.
        </EmptyState>
      )}

      <div className="draft-list unfold-stagger">
        {drafts.map((draft) => (
          <DraftCard
            key={`${draft.id}-${draft.draft_subject}-${draft.status}`}
            draft={draft}
            busy={busyId === draft.id}
            paused={paused}
            onAction={(action) =>
              action === "send" ? setConfirmSend(draft) : void act(draft, action)
            }
            onSave={(edits) => save(draft, edits)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(confirmSend)}
        title={`Send to ${confirmSend?.sales_sequence_enrollments?.sales_contacts?.email ?? "this contact"}?`}
        body={confirmSend ? `${confirmSend.draft_subject}\n\n${confirmSend.draft_body}` : undefined}
        confirmLabel="Send email"
        busy={Boolean(confirmSend && busyId === confirmSend.id)}
        onConfirm={() => {
          const draft = confirmSend;
          setConfirmSend(null);
          if (draft) void act(draft, "send");
        }}
        onCancel={() => setConfirmSend(null)}
      />

      <ConfirmDialog
        open={confirmBatch}
        title={`Send ${approved.length} approved emails?`}
        body="Each one is checked against the kill switch, suppression list and daily cap as it goes."
        confirmLabel={`Send ${approved.length}`}
        onConfirm={() => void sendAllApproved()}
        onCancel={() => setConfirmBatch(false)}
      />
    </section>
  );
}
