"use client";

import { useCallback, useEffect, useState } from "react";
import type { Meeting, SalesNotification, SalesTask } from "@/lib/salesTypes";
import SalesConversationThread from "@/components/SalesConversationThread";
import type { SalesConversation } from "@/lib/salesTypes";

interface SalesNeedsYouProps {
  sessionDbId: string | null;
}

export default function SalesNeedsYou({ sessionDbId }: SalesNeedsYouProps) {
  const [notifications, setNotifications] = useState<SalesNotification[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [tasks, setTasks] = useState<SalesTask[]>([]);
  const [conversations, setConversations] = useState<SalesConversation[]>([]);
  const [activeConv, setActiveConv] = useState<SalesConversation | null>(null);

  const refresh = useCallback(() => {
    if (!sessionDbId) return;
    fetch(`/api/sales/inbox?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => setNotifications([...(j.escalations ?? []), ...(j.notifications ?? [])]))
      .catch(() => {});

    fetch(`/api/sales/meetings?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => setMeetings((j.meetings ?? []).filter((m: Meeting) => m.status === "proposed")))
      .catch(() => {});

    fetch(`/api/sales/tasks?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) =>
        setTasks(
          (j.tasks ?? []).filter(
            (t: SalesTask) => t.status === "open" || t.status === "in_progress",
          ),
        ),
      )
      .catch(() => {});

    fetch(`/api/sales/conversations?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => setConversations(j.conversations ?? []))
      .catch(() => {});
  }, [sessionDbId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function markRead(id: string) {
    await fetch("/api/sales/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
    refresh();
  }

  function openConversation(notif: SalesNotification) {
    if (notif.entity_type === "sales_conversation" && notif.entity_id) {
      const conv = conversations.find((c) => c.id === notif.entity_id);
      if (conv) {
        setActiveConv(conv);
        if (notif.id) markRead(notif.id);
      }
    }
  }

  if (activeConv) {
    return (
      <SalesConversationThread
        conversation={activeConv}
        onBack={() => {
          setActiveConv(null);
          refresh();
        }}
        onRefresh={refresh}
      />
    );
  }

  const unread = notifications.filter((n) => !n.read);
  const hasItems = unread.length > 0 || meetings.length > 0 || tasks.length > 0;

  return (
    <div className="sales-panel">
      <p className="sales-intro" style={{ marginBottom: "var(--stack-md)" }}>
        Replies, meeting requests, and tasks that need your decision.
      </p>

      {!sessionDbId && (
        <p className="mono" style={{ color: "var(--ink-soft)", fontSize: 13 }}>
          Complete setup and send outreach to see items here.
        </p>
      )}

      {sessionDbId && !hasItems && (
        <p className="mono" style={{ color: "var(--ink-soft)", fontSize: 13 }}>
          Nothing needs you right now — Kami will surface replies and meeting requests here.
        </p>
      )}

      {unread.map((n) => (
        <button
          key={n.id}
          type="button"
          className="kraft-card"
          onClick={() => openConversation(n)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            marginBottom: "var(--stack-sm)",
            padding: "var(--stack-sm)",
            cursor: "pointer",
          }}
        >
          <p className="label-caps" style={{ fontSize: 11 }}>
            {n.kind?.replace(/_/g, " ") ?? "Notification"}
          </p>
          <p style={{ fontSize: 14, marginTop: "0.25rem" }}>
            {n.title ?? n.body ?? "Needs your input"}
          </p>
        </button>
      ))}

      {meetings.map((m) => (
        <div
          key={m.id}
          className="kraft-card"
          style={{ padding: "var(--stack-sm)", marginBottom: "var(--stack-sm)" }}
        >
          <p className="label-caps" style={{ fontSize: 11 }}>
            Meeting proposed
          </p>
          <p style={{ fontSize: 14, marginTop: "0.25rem" }}>
            {m.title ?? "New meeting"} — review in More → Meetings
          </p>
        </div>
      ))}

      {tasks.map((t) => (
        <div
          key={t.id}
          className="kraft-card"
          style={{ padding: "var(--stack-sm)", marginBottom: "var(--stack-sm)" }}
        >
          <p className="label-caps" style={{ fontSize: 11 }}>
            Task
          </p>
          <p style={{ fontSize: 14, marginTop: "0.25rem" }}>{t.title}</p>
        </div>
      ))}
    </div>
  );
}
