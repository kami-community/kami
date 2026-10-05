"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Conversation, ConversationMessage } from "@/lib/marketingTypes";
import EscalationBanner from "@/components/EscalationBanner";

interface ConversationThreadProps {
  sessionId: string;
  conversation: Conversation;
  handle: string;
  onBack: () => void;
  onRefresh: () => void;
}

export default function ConversationThread({
  sessionId,
  conversation,
  handle,
  onBack,
  onRefresh,
}: ConversationThreadProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const replyIdRef = useRef<string | null>(null);

  const fetchMessages = useCallback(() => {
    fetch(`/api/marketing/conversations/${conversation.id}?session_id=${sessionId}`)
      .then((r) => r.json())
      .then((j) => setMessages(j.messages ?? []))
      .catch(() => {});
  }, [conversation.id, sessionId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  async function sendManual() {
    const text = input.trim();
    if (!text || sending) return;
    // One id per composed message: retries of the same text never send twice.
    replyIdRef.current ??= crypto.randomUUID();
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/marketing/conversations/${conversation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          session_id: sessionId,
          content: text,
          client_message_id: replyIdRef.current,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setSendError(json.error ?? "Message failed");
        return;
      }
      setInput("");
      replyIdRef.current = null;
      fetchMessages();
    } catch {
      setSendError("Network error — message not sent");
    } finally {
      setSending(false);
    }
  }

  async function handleEscalation(action: "approve" | "counter" | "decline") {
    await fetch(`/api/marketing/conversations/${conversation.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", session_id: sessionId, decision: action }),
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
            onChange={(e) => {
              setInput(e.target.value);
              replyIdRef.current = null; // edited text is a new message
            }}
            placeholder="Type to take over this conversation…"
            disabled={sending}
          />
        </div>
        <button
          className="hanko-btn"
          onClick={sendManual}
          disabled={sending || !input.trim()}
          style={{ alignSelf: "flex-end" }}
        >
          {sending ? "Sending…" : "Send DM"}
        </button>
      </div>
      {sendError && (
        <p role="alert" className="mono form-error">
          {sendError}
        </p>
      )}
    </div>
  );
}
