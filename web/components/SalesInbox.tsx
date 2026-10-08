"use client";

import { useCallback, useState } from "react";
import NotificationList from "@/components/sales/NotificationList";
import SalesConversationThread from "@/components/SalesConversationThread";
import Callout from "@/components/ui/Callout";
import EmptyState from "@/components/ui/EmptyState";
import { IconInbox, IconMail, IconWarning } from "@/components/ui/icons";
import Skeleton from "@/components/ui/Skeleton";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { InboxView } from "@/lib/sales/inbox";
import type { SalesConversation, SalesNotification } from "@/lib/salesTypes";

/**
 * The campaign's Sales inbox plus its conversations, and the action that opens
 * a notification's conversation (marking it read). Shared by Inbox and Needs you.
 */
export function useSalesInbox(sessionId: string | null, onChanged?: () => void) {
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
    onChanged?.();
  }, [reloadInbox, reloadConversations, onChanged]);

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
      onChanged?.();
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

export function notificationItem(
  n: SalesNotification,
  canOpen: boolean,
  onOpen: () => void,
): Parameters<typeof NotificationList>[0]["items"][number] {
  const escalation = /escalat/i.test(n.kind);
  return {
    key: n.id ?? `${n.kind}-${n.title}`,
    kind: n.kind,
    tone: escalation ? "red" : n.read ? "neutral" : "accent",
    title: n.title,
    body: n.body,
    at: n.created_at,
    icon: escalation ? <IconWarning size={15} /> : <IconMail size={15} />,
    onOpen: canOpen ? onOpen : undefined,
  };
}

export default function SalesInbox({
  sessionDbId,
  onChanged,
}: {
  sessionDbId: string | null;
  onChanged?: () => void;
}) {
  const inbox = useSalesInbox(sessionDbId, onChanged);

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
        .slice(0, 30)
    : [];

  return (
    <>
      {inbox.error && <Callout tone="error">{inbox.error}</Callout>}
      {inbox.loading && !inbox.inbox && <Skeleton title lines={4} />}
      {inbox.inbox && items.length === 0 && (
        <EmptyState title="No pending decisions" icon={<IconInbox size={16} />}>
          Replies and escalations from your outbound land here.
        </EmptyState>
      )}
      {items.length > 0 && (
        <NotificationList
          label="Inbox"
          items={items.map((n) => notificationItem(n, inbox.canOpen(n), () => void inbox.open(n)))}
        />
      )}
    </>
  );
}
