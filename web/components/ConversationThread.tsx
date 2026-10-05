"use client";

import { useCallback, useEffect, useState } from "react";
import type { Conversation, ConversationMessage } from "@/lib/marketingTypes";
import EscalationBanner from "@/components/EscalationBanner";

interface ConversationThreadProps {
  conversation: Conversation;
  handle: string;
  onBack: () => void;
  onRefresh: () => void;
}

export default function ConversationThread({
  conversation,
  handle,
  onBack,
  onRefresh,
}: ConversationThreadProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const fetchMessages = useCallback(() => {
    fetch(`/api/conversations/${conversation.id}`)
      .then((r) => r.json())
      .then((j) => setMessages(j.messages ?? []))
      .catch(() => {});
  }, [conversation.id]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  async function sendManual() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    try {
      await fetch(`/api/conversations/${conversation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", content: text }),
      });
      fetchMessages();
    } catch {
      // noop
    } finally {
      setSending(false);
    }
  }

  async function handleEscalation(action: "approve" | "counter" | "decline") {
    await fetch(`/api/conversations/${conversation.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    onRefresh();
  }

  return (
    <div>
      <button
        type="button"
        className="mono"
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--ink-soft)",
          marginBottom: "var(--stack-sm)",
        }}
      >
        ← back to conversations
      </button>
      <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
        @{handle} · {conversation.status.replace(/_/g, " ")}
      </p>

      {conversation.status === "escalated" && conversation.escalation_reason && (
        <EscalationBanner
          reason={conversation.escalation_reason}
          onApprove={() => handleEscalation("approve")}
          onCounter={() => handleEscalation("counter")}
          onDecline={() => handleEscalation("decline")}
        />
      )}

      <div
        className="kraft-card"
        style={{ maxHeight: 400, overflowY: "auto", marginBottom: "var(--stack-sm)" }}
      >
        {messages.length === 0 && (
          <p className="mono" style={{ color: "var(--ink-soft)" }}>
            No messages yet.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: "var(--stack-sm)" }}>
            <span
              className="label-caps"
              style={{ color: m.sender === "kami" ? "var(--moss)" : "var(--ink-soft)" }}
            >
              {m.sender === "kami" ? "You (Kami)" : handle}
            </span>
            <span
              className="mono"
              style={{ fontSize: 11, color: "var(--outline)", marginLeft: "0.5rem" }}
            >
              {new Date(m.sent_at).toLocaleTimeString()}
            </span>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                whiteSpace: "pre-wrap",
                marginTop: "0.2rem",
              }}
            >
              {m.content}
            </p>
            {m.status === "failed" && (
              <span className="mono" style={{ fontSize: 11, color: "var(--hanko)" }}>
                ⚠ failed to send
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div className="form-line" style={{ flex: 1 }}>
          <label className="mono label-caps" htmlFor="manual-msg">
            Take over
          </label>
          <input
            id="manual-msg"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendManual()}
            placeholder="Type to take over this conversation…"
            disabled={sending}
          />
        </div>
        <button
          className="hanko-btn"
          onClick={sendManual}
          disabled={sending}
          style={{ alignSelf: "flex-end" }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
