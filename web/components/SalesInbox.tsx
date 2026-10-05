"use client";

import { useCallback, useEffect, useState } from "react";
import type { SalesConversation, SalesNotification } from "@/lib/salesTypes";
import SalesConversationThread from "@/components/SalesConversationThread";

interface SalesInboxProps {
  sessionDbId: string | null;
}

export default function SalesInbox({ sessionDbId }: SalesInboxProps) {
  const [notifications, setNotifications] = useState<SalesNotification[]>([]);
  const [escalations, setEscalations] = useState<SalesNotification[]>([]);
  const [conversations, setConversations] = useState<SalesConversation[]>([]);
  const [activeConv, setActiveConv] = useState<SalesConversation | null>(null);

  const fetchInbox = useCallback(() => {
    if (!sessionDbId) return;
    fetch(`/api/sales/inbox?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => {
        setNotifications(j.notifications ?? []);
        setEscalations(j.escalations ?? []);
      })
      .catch(() => {});

    fetch(`/api/sales/conversations?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => setConversations(j.conversations ?? []))
      .catch(() => {});
  }, [sessionDbId]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  async function markRead(id: string) {
    await fetch("/api/sales/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
    fetchInbox();
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
          fetchInbox();
        }}
        onRefresh={fetchInbox}
      />
    );
  }

  const items = [...escalations, ...notifications.filter((n) => !n.read)].slice(0, 20);

  return (
    <div>
      {items.length === 0 && (
        <p className="mono" style={{ color: "var(--ink-soft)", fontSize: 13 }}>
          No pending decisions.
        </p>
      )}
      {items.map((n) => (
        <button
          key={n.id}
          type="button"
          className="kraft-card"
          onClick={() => openConversation(n)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "0.6rem 0.75rem",
            marginBottom: "0.35rem",
            cursor: n.entity_type === "sales_conversation" ? "pointer" : "default",
            borderLeft: n.kind === "escalation" ? "3px solid var(--hanko)" : undefined,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span
              className="label-caps"
              style={{
                fontSize: 10,
                color: n.kind === "escalation" ? "var(--hanko)" : "var(--moss)",
              }}
            >
              {n.kind}
            </span>
            <span className="mono" style={{ fontSize: 10, color: "var(--outline)" }}>
              {n.created_at ? new Date(n.created_at).toLocaleDateString() : ""}
            </span>
          </div>
          <p style={{ fontSize: 13, margin: "0.25rem 0 0", fontWeight: 600 }}>{n.title}</p>
          {n.body && (
            <p
              className="mono"
              style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0.15rem 0 0" }}
            >
              {n.body}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}
