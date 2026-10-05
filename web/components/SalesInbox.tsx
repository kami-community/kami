"use client";

import { useCallback, useState } from "react";
import type { InboxView } from "@/lib/sales/inbox";
import type { SalesConversation, SalesNotification } from "@/lib/salesTypes";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import SalesConversationThread from "@/components/SalesConversationThread";

/**
 * The campaign's Sales inbox plus its conversations, and the action that opens
 * a notification's conversation (marking it read). Shared by Inbox and Needs you.
 */
export function useSalesInbox(sessionId: string | null) {
  const inbox = useApi<InboxView>(
    sessionId ? withQuery("/api/sales/inbox", { session_id: sessionId }) : null,
  );
  const conversations = useApi<{ conversations: SalesConversation[] }>(
    sessionId ? withQuery("/api/sales/conversations", { session_id: sessionId }) : null,
  );
  const [active, setActive] = useState<SalesConversation | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reloadInbox = inbox.reload;
  const reloadConversations = conversations.reload;
  const reload = useCallback(() => {
    reloadInbox();
    reloadConversations();
  }, [reloadInbox, reloadConversations]);

  const conversationFor = (n: SalesNotification) =>
    n.entity_type === "sales_conversation" && n.entity_id
      ? (conversations.data?.conversations.find((c) => c.id === n.entity_id) ?? null)
      : null;

  async function open(n: SalesNotification) {
    const conv = conversationFor(n);
    if (!conv || !sessionId) return;
    setActive(conv);
    if (!n.id || n.read) return;
    try {
      await api.patch("/api/sales/inbox", { session_id: sessionId, id: n.id, read: true });
      setActionError(null);
      reloadInbox();
    } catch (err) {
      setActionError(errorMessage(err, "Could not mark the notification read"));
    }
  }

  return {
    inbox: inbox.data,
    loading: inbox.loading || conversations.loading,
    error: inbox.error ?? conversations.error ?? actionError,
    active,
    close: () => {
      setActive(null);
      reload();
    },
    open,
    canOpen: (n: SalesNotification) => Boolean(conversationFor(n)),
    reload,
  };
}

export function NotificationCard({
  notification: n,
  canOpen,
  onOpen,
}: {
  notification: SalesNotification;
  canOpen: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="kraft-card notice-card"
      data-kind={n.kind}
      onClick={onOpen}
      disabled={!canOpen}
    >
      <span className="notice-card__head">
        <span className="label-caps notice-card__kind">{n.kind.replace(/_/g, " ")}</span>
        {n.created_at && (
          <span className="fine-print">{new Date(n.created_at).toLocaleDateString()}</span>
        )}
      </span>
      <span className="notice-card__title">{n.title}</span>
      {n.body && <span className="fine-print notice-card__body">{n.body}</span>}
    </button>
  );
}

interface SalesInboxProps {
  sessionDbId: string | null;
}

export default function SalesInbox({ sessionDbId }: SalesInboxProps) {
  const inbox = useSalesInbox(sessionDbId);

  if (inbox.active) {
    return (
      <SalesConversationThread
        conversation={inbox.active}
        onBack={inbox.close}
        onRefresh={inbox.reload}
      />
    );
  }

  const items = inbox.inbox
    ? [...inbox.inbox.escalations, ...inbox.inbox.notifications.filter((n) => !n.read)]
        .filter((n, i, all) => all.findIndex((m) => m.id === n.id) === i)
        .slice(0, 20)
    : [];

  return (
    <section className="panel-section" aria-labelledby="sales-inbox-title">
      <p id="sales-inbox-title" className="label-caps">
        Inbox
      </p>
      {inbox.error && (
        <p role="alert" className="form-error">
          {inbox.error}
        </p>
      )}
      {inbox.loading && !inbox.inbox && <p className="fine-print">Loading inbox…</p>}
      {inbox.inbox && items.length === 0 && <p className="fine-print">No pending decisions.</p>}
      <div className="card-list card-list--tight">
        {items.map((n) => (
          <NotificationCard
            key={n.id}
            notification={n}
            canOpen={inbox.canOpen(n)}
            onOpen={() => void inbox.open(n)}
          />
        ))}
      </div>
    </section>
  );
}
