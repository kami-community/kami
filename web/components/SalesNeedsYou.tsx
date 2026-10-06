"use client";

import NotificationList, { type NotificationItem } from "@/components/sales/NotificationList";
import SalesConversationThread from "@/components/SalesConversationThread";
import { notificationItem, useSalesInbox } from "@/components/SalesInbox";
import Callout from "@/components/ui/Callout";
import EmptyState from "@/components/ui/EmptyState";
import { IconCalendar, IconCheckCircle, IconList } from "@/components/ui/icons";
import Skeleton from "@/components/ui/Skeleton";
import { withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { Meeting, SalesTask } from "@/lib/salesTypes";

/** Replies, meeting requests and tasks waiting on the founder. */
export default function SalesNeedsYou({
  sessionDbId,
  onNavigate,
}: {
  sessionDbId: string | null;
  /** open the full list for a kind of item */
  onNavigate: (target: "meetings" | "tasks") => void;
}) {
  const inbox = useSalesInbox(sessionDbId);
  const meetings = useApi<{ meetings: Meeting[] }>(
    sessionDbId ? withQuery("/api/sales/meetings", { session_id: sessionDbId }) : null,
  );
  const tasks = useApi<{ tasks: SalesTask[] }>(
    sessionDbId ? withQuery("/api/sales/tasks", { session_id: sessionDbId }) : null,
  );

  if (inbox.active) {
    return (
      <SalesConversationThread
        conversation={inbox.active}
        onBack={() => {
          inbox.close();
          meetings.reload();
          tasks.reload();
        }}
        onRefresh={inbox.reload}
      />
    );
  }

  const unread = inbox.inbox
    ? [...inbox.inbox.escalations, ...inbox.inbox.notifications].filter(
        (n, i, all) => !n.read && all.findIndex((m) => m.id === n.id) === i,
      )
    : [];
  const proposed = (meetings.data?.meetings ?? []).filter((m) => m.status === "proposed");
  const openTasks = (tasks.data?.tasks ?? []).filter(
    (t) => t.status === "open" || t.status === "in_progress",
  );
  const loading = inbox.loading || meetings.loading || tasks.loading;
  const errors = [inbox.error, meetings.error, tasks.error].filter((e): e is string => Boolean(e));

  const items: NotificationItem[] = [
    ...unread.map((n) => notificationItem(n, inbox.canOpen(n), () => void inbox.open(n))),
    ...proposed.map((m) => ({
      key: `meeting-${m.id}`,
      kind: "meeting_request",
      tone: "green" as const,
      title: m.title ?? "New meeting request",
      body: "Accept with a calendar invite, or decline.",
      icon: <IconCalendar size={15} />,
      onOpen: () => onNavigate("meetings"),
    })),
    ...openTasks.map((t) => ({
      key: `task-${t.id}`,
      kind: `${t.priority}_priority_task`,
      tone: (t.priority === "high" ? "orange" : "neutral") as NotificationItem["tone"],
      title: t.title,
      body: t.due_at ? `Due ${new Date(t.due_at).toLocaleDateString()}` : undefined,
      icon: <IconList size={15} />,
      onOpen: () => onNavigate("tasks"),
    })),
  ];

  return (
    <>
      {errors.map((e) => (
        <Callout key={e} tone="error">
          {e}
        </Callout>
      ))}
      {loading && !items.length && <Skeleton title lines={4} />}
      {!loading && !items.length && !errors.length && (
        <EmptyState title="Nothing needs you right now" icon={<IconCheckCircle size={16} />}>
          Kami will surface replies, meeting requests and follow-ups here.
        </EmptyState>
      )}
      {items.length > 0 && <NotificationList label="Needs you" items={items} />}
    </>
  );
}
