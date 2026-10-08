"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import DraftCard, {
  nextAction,
  type DraftAction,
  type DraftRow,
} from "@/components/sales/DraftCard";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import EmptyState from "@/components/ui/EmptyState";
import { IconMail, IconSend } from "@/components/ui/icons";
import Segmented from "@/components/ui/Segmented";
import Skeleton from "@/components/ui/Skeleton";
import { api, ApiError, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";

interface SalesDraftQueueProps {
  sessionDbId: string | null;
  paused?: boolean;
  onSent?: () => void;
  /** any draft changed state (edit / review / approve) */
  onChanged?: () => void;
}

/** After this many one-by-one sends, the founder can batch-send the rest. */
const INDIVIDUAL_SENDS_BEFORE_BATCH = 1;

type Filter = "all" | "check" | "approved";

/**
 * Review emails: each draft moves check → approve → send, one step at a time.
 * The first sends go one by one; after that the rest can be sent together.
 */
export default function SalesDraftQueue({
  sessionDbId,
  paused = false,
  onSent,
  onChanged,
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
  const [filter, setFilter] = useState<Filter>("all");

  // stable order (company, then sequence step) so cards don't jump after an action
  const drafts = (query.data?.drafts ?? [])
    .filter((d) => d.status !== "sent")
    .sort((a, b) => {
      const an = a.sales_sequence_enrollments?.sales_accounts?.name ?? "";
      const bn = b.sales_sequence_enrollments?.sales_accounts?.name ?? "";
      return an.localeCompare(bn) || a.step - b.step || a.id.localeCompare(b.id);
    });
  const approved = drafts.filter((d) => d.status === "approved");
  const toCheck = drafts.filter((d) => d.status !== "approved");
  const visible = filter === "approved" ? approved : filter === "check" ? toCheck : drafts;
  const canBatch = sentThisVisit >= INDIVIDUAL_SENDS_BEFORE_BATCH && approved.length > 1;
  // one accent per screen: the batch send, or else the first card with a next step
  const emphasized = canBatch ? null : (visible.find((d) => nextAction(d))?.id ?? null);

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
      onChanged?.();
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
      onChanged?.();
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
      {query.data && (
        <div className="draft-queue__bar">
          <Segmented<Filter>
            label="Filter drafts"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: drafts.length },
              { value: "check", label: "To review", count: toCheck.length },
              { value: "approved", label: "Approved", count: approved.length },
            ]}
          />
          {canBatch && (
            <Button
              variant="accent"
              size="sm"
              icon={<IconSend size={13} />}
              onClick={() => setConfirmBatch(true)}
              disabled={paused || Boolean(busyId)}
            >
              Send {approved.length} approved
            </Button>
          )}
        </div>
      )}

      <div className="stack stack--sm">
        {paused && (
          <Callout tone="warn">
            Sending is paused. Resume Sales, or turn off the kill switch, to send.
          </Callout>
        )}
        {needsFirstSendApproval && (
          <Callout
            tone="warn"
            title="The first email of this campaign needs your explicit go-ahead"
            actions={
              <Button
                size="sm"
                variant="secondary"
                busy={approving}
                onClick={() => void approveFirstSend()}
              >
                Approve the first send
              </Button>
            }
          />
        )}
        {(error ?? query.error) && <Callout tone="error">{error ?? query.error}</Callout>}
      </div>

      {query.loading && !query.data && <Skeleton title lines={6} />}

      {sessionDbId && query.data && visible.length === 0 && (
        <EmptyState
          title={drafts.length ? "Nothing in this filter" : "All caught up"}
          icon={<IconMail size={16} />}
        >
          {drafts.length
            ? "Try another filter."
            : "Every draft has been sent. New drafts appear here when you pick more companies."}
        </EmptyState>
      )}

      <div className="draft-queue__list">
        {visible.map((draft) => (
          <div
            key={`${draft.id}-${draft.draft_subject}-${draft.status}`}
            className="draft-queue__item"
          >
            <DraftCard
              draft={draft}
              sessionId={sessionDbId ?? ""}
              busy={busyId === draft.id}
              paused={paused}
              emphasis={draft.id === emphasized}
              onAction={(action) =>
                action === "send" ? setConfirmSend(draft) : void act(draft, action)
              }
              onSave={(edits) => save(draft, edits)}
            />
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(confirmSend)}
        title={`Send to ${confirmSend?.sales_sequence_enrollments?.sales_contacts?.email ?? "this contact"}?`}
        body={
          confirmSend ? (
            <div className="send-preview">
              <p className="send-preview__subject">{confirmSend.draft_subject}</p>
              <p className="send-preview__body">{confirmSend.draft_body}</p>
            </div>
          ) : undefined
        }
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
        body="Each one is checked against the kill switch, the do-not-contact list and your daily limit as it goes."
        confirmLabel={`Send ${approved.length}`}
        onConfirm={() => void sendAllApproved()}
        onCancel={() => setConfirmBatch(false)}
      />
    </section>
  );
}
