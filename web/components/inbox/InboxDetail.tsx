"use client";

import { useState, type ReactNode } from "react";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import OpportunityCard from "@/components/marketing/OpportunityCard";
import MeetingQueue from "@/components/MeetingQueue";
import DraftCard, { type DraftAction, type DraftRow } from "@/components/sales/DraftCard";
import SalesConversationThread from "@/components/SalesConversationThread";
import SalesTaskBoard from "@/components/SalesTaskBoard";
import { useWorkspace } from "@/components/shell/WorkspaceContext";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBody } from "@/components/ui/Card";
import { IconArrowLeft, IconArrowUpRight, IconCheck } from "@/components/ui/icons";
import { api, errorMessage } from "@/lib/client/api";
import type { InboxItem } from "@/lib/inbox/inbox";
import { timeAgo } from "./format";
import { inboxIcon, INBOX_TYPES } from "./InboxRow";

type Item<T extends InboxItem["type"]> = Extract<InboxItem, { type: T }>;

interface DetailProps {
  item: InboxItem;
  /** close the detail (narrow screens show the list again) */
  onClose: () => void;
  /** something changed: refetch the inbox and progress */
  onChanged: () => void;
}

function DetailHead({
  item,
  onClose,
  actions,
}: {
  item: InboxItem;
  onClose: () => void;
  actions?: ReactNode;
}) {
  return (
    <header className="inbox-detail__head">
      <Button
        size="xs"
        variant="quiet"
        icon={<IconArrowLeft size={13} />}
        className="inbox-detail__back"
        onClick={onClose}
      >
        All items
      </Button>
      <div className="inbox-detail__title-row">
        <span className={`inbox-row__icon inbox-row__icon--${item.type}`}>{inboxIcon(item)}</span>
        <div className="inbox-detail__titles">
          <p className="inbox-detail__kind">
            {INBOX_TYPES[item.type].label}
            {item.at && <> · {timeAgo(item.at)}</>}
          </p>
          <h2 className="inbox-detail__title">{item.title}</h2>
        </div>
        {actions && <div className="inbox-detail__actions">{actions}</div>}
      </div>
    </header>
  );
}

function ReplyDetail({ item, onClose, onChanged }: DetailProps & { item: Item<"reply"> }) {
  const { sessionId } = useCampaign();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notification, conversation } = item;

  async function markDone() {
    if (!notification.id) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch("/api/sales/inbox", {
        session_id: sessionId,
        id: notification.id,
        read: true,
      });
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "Could not mark this as done"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DetailHead
        item={item}
        onClose={onClose}
        actions={
          <Button
            size="sm"
            variant="secondary"
            icon={<IconCheck size={13} />}
            busy={busy}
            onClick={() => void markDone()}
          >
            Mark done
          </Button>
        }
      />
      {error && <Callout tone="error">{error}</Callout>}
      {conversation ? (
        <SalesConversationThread
          conversation={conversation}
          showBack={false}
          onBack={onClose}
          onRefresh={onChanged}
        />
      ) : (
        <Card>
          <CardBody roomy>
            <p className="inbox-detail__body">{notification.body || "No further detail."}</p>
          </CardBody>
        </Card>
      )}
    </>
  );
}

function DraftDetail({ item, onClose, onChanged }: DetailProps & { item: Item<"draft"> }) {
  const { sessionId, progress } = useCampaign();
  const { navigate } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = item.draft as DraftRow;
  const paused = Boolean(progress?.paused || progress?.sales.paused);

  async function run(fn: () => Promise<unknown>, fallback: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (err) {
      setError(errorMessage(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function act(action: DraftAction) {
    // Sending happens in Find customers → Emails, which confirms exactly what goes out.
    if (action === "send") return navigate({ area: "sales", tab: "emails" });
    void run(
      () =>
        api.post("/api/sales/drafts", { action, touchpoint_id: draft.id, session_id: sessionId }),
      `Could not ${action} the draft`,
    );
  }

  return (
    <>
      <DetailHead
        item={item}
        onClose={onClose}
        actions={
          <Button
            size="sm"
            variant="quiet"
            onClick={() => navigate({ area: "sales", tab: "emails" })}
          >
            All emails
          </Button>
        }
      />
      {paused && (
        <Callout tone="warn">
          Kami is paused. Resume from the kill switch to approve emails.
        </Callout>
      )}
      {error && <Callout tone="error">{error}</Callout>}
      <DraftCard
        key={`${draft.id}-${draft.draft_subject}-${draft.status}`}
        draft={draft}
        sessionId={sessionId}
        busy={busy}
        paused={paused}
        onAction={act}
        onSave={(edits) =>
          run(async () => {
            await api.post("/api/sales/drafts", {
              action: "edit",
              touchpoint_id: draft.id,
              session_id: sessionId,
              ...edits,
            });
            await api.post("/api/sales/drafts", {
              action: "review",
              touchpoint_id: draft.id,
              session_id: sessionId,
            });
          }, "Could not save the draft")
        }
      />
      <p className="text-3 text-xs">
        Approved emails leave your inbox and wait in Emails, where you send them.
      </p>
    </>
  );
}

function OpportunityDetail({
  item,
  onClose,
  onChanged,
}: DetailProps & { item: Item<"opportunity"> }) {
  const { sessionId } = useCampaign();
  const { navigate } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | undefined>();
  const o = item.opportunity;

  async function save(edits: Record<string, unknown>, message: string) {
    setSaving(true);
    try {
      await api.post("/api/marketing/distribution/opportunities", {
        session_id: sessionId,
        action: "update",
        id: o.id,
        ...edits,
      });
      setFlash(message);
      onChanged();
    } catch (err) {
      setFlash(errorMessage(err, "Could not save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  const toDistribution = () => navigate({ area: "distribution", tab: "opportunities" });
  return (
    <>
      <DetailHead
        item={item}
        onClose={onClose}
        actions={
          <Button
            size="sm"
            variant="quiet"
            icon={<IconArrowUpRight size={13} />}
            onClick={toDistribution}
          >
            {o.platform === "x" ? "Post from Distribution" : "All opportunities"}
          </Button>
        }
      />
      <OpportunityCard
        key={`${o.id}-${o.updated_at ?? ""}`}
        opportunity={o}
        sessionId={sessionId}
        // posting to X confirms in Distribution; here the founder reviews, edits, skips or logs a manual post
        canPostToX={false}
        saving={saving}
        flash={flash}
        onSave={(edits, message) => void save(edits, message)}
        onPostToX={toDistribution}
      />
    </>
  );
}

function MeetingDetail({ item, onClose, onChanged }: DetailProps & { item: Item<"meeting"> }) {
  const { sessionId } = useCampaign();
  return (
    <>
      <DetailHead item={item} onClose={onClose} />
      <p className="text-2 text-sm">
        {item.context}. Every invite confirms exactly who it goes to before it is sent.
      </p>
      <MeetingQueue sessionDbId={sessionId} focusId={item.meeting.id} onChanged={onChanged} />
    </>
  );
}

function TaskDetail({ item, onClose, onChanged }: DetailProps & { item: Item<"task"> }) {
  const { sessionId } = useCampaign();
  return (
    <>
      <DetailHead item={item} onClose={onClose} />
      {item.task.description && <p className="inbox-detail__body">{item.task.description}</p>}
      <SalesTaskBoard sessionDbId={sessionId} focusId={item.task.id} onChanged={onChanged} />
    </>
  );
}

/** The right-hand pane: the selected item, handled with that item's own existing flow. */
export default function InboxDetail(props: DetailProps) {
  const { item } = props;
  let body: ReactNode;
  switch (item.type) {
    case "reply":
      body = <ReplyDetail {...props} item={item} />;
      break;
    case "draft":
      body = <DraftDetail {...props} item={item} />;
      break;
    case "opportunity":
      body = <OpportunityDetail {...props} item={item} />;
      break;
    case "meeting":
      body = <MeetingDetail {...props} item={item} />;
      break;
    case "task":
      body = <TaskDetail {...props} item={item} />;
      break;
  }
  return (
    <section
      className="inbox-detail fade-up"
      aria-label={`${INBOX_TYPES[item.type].label}: ${item.title}`}
    >
      {body}
    </section>
  );
}
