"use client";

import type { Meeting, SalesTask } from "@/lib/salesTypes";
import { withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import SalesConversationThread from "@/components/SalesConversationThread";
import { NotificationCard, useSalesInbox } from "@/components/SalesInbox";

interface SalesNeedsYouProps {
  sessionDbId: string | null;
}

/** Replies, meeting requests and tasks waiting on the founder. */
export default function SalesNeedsYou({ sessionDbId }: SalesNeedsYouProps) {
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
  const errors = [inbox.error, meetings.error, tasks.error].filter(Boolean);
  const hasItems = unread.length > 0 || proposed.length > 0 || openTasks.length > 0;

  return (
    <div className="sales-panel">
      <p className="sales-intro">Replies, meeting requests, and tasks that need your decision.</p>

      {!sessionDbId && (
        <p className="fine-print">Complete setup and send outreach to see items here.</p>
      )}
      {errors.map((e) => (
        <p key={e} role="alert" className="form-error">
          {e}
        </p>
      ))}
      {sessionDbId && loading && !hasItems && <p className="fine-print">Loading…</p>}
      {sessionDbId && !loading && !hasItems && errors.length === 0 && (
        <p className="fine-print">
          Nothing needs you right now — Kami will surface replies and meeting requests here.
        </p>
      )}

      <div className="card-list">
        {unread.map((n) => (
          <NotificationCard
            key={n.id}
            notification={n}
            canOpen={inbox.canOpen(n)}
            onOpen={() => void inbox.open(n)}
          />
        ))}

        {proposed.map((m) => (
          <div key={m.id} className="kraft-card compact-card">
            <p className="label-caps">Meeting proposed</p>
            <p className="notice-card__title">
              {m.title ?? "New meeting"} — review in More → Meetings
            </p>
          </div>
        ))}

        {openTasks.map((t) => (
          <div key={t.id} className="kraft-card compact-card">
            <p className="label-caps">Task</p>
            <p className="notice-card__title">{t.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
