"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReplyClassificationLabel, SalesConversation } from "@/lib/salesTypes";

interface MessageWithClassification {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  sent_at?: string;
  classification?: {
    label: ReplyClassificationLabel;
    confidence?: number;
    escalation_required?: boolean;
    draft_response?: string;
  } | null;
}

const LABELS: ReplyClassificationLabel[] = [
  "positive",
  "objection",
  "information_request",
  "referral",
  "not_now",
  "unsubscribe",
  "negative",
  "spam_risk",
];

interface SalesConversationThreadProps {
  conversation: SalesConversation;
  onBack: () => void;
  onRefresh: () => void;
}

export default function SalesConversationThread({
  conversation,
  onBack,
  onRefresh,
}: SalesConversationThreadProps) {
  const [messages, setMessages] = useState<MessageWithClassification[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [classifying, setClassifying] = useState<string | null>(null);

  const fetchMessages = useCallback(() => {
    fetch(`/api/sales/conversations/${conversation.id}`)
      .then((r) => r.json())
      .then((j) => setMessages(j.messages ?? []))
      .catch(() => {});
  }, [conversation.id]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    try {
      await fetch(`/api/sales/conversations/${conversation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "message", content: text }),
      });
      fetchMessages();
    } finally {
      setSending(false);
    }
  }

  async function classifyMessage(messageId: string, label?: ReplyClassificationLabel) {
    setClassifying(messageId);
    try {
      await fetch(`/api/sales/conversations/${conversation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "classify", message_id: messageId, label }),
      });
      fetchMessages();
      onRefresh();
    } finally {
      setClassifying(null);
    }
  }

  async function escalate() {
    await fetch(`/api/sales/conversations/${conversation.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "escalate", reason: "Manual review requested" }),
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
        ← back to inbox
      </button>
      <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
        {conversation.channel} · {conversation.status.replace(/_/g, " ")}
      </p>

      {conversation.status === "escalated" && (
        <div
          className="kraft-card"
          style={{
            padding: "0.5rem",
            marginBottom: "var(--stack-sm)",
            borderLeft: "3px solid var(--hanko)",
          }}
        >
          <p className="mono" style={{ fontSize: 12, color: "var(--hanko)" }}>
            Escalated — review before auto-reply
          </p>
        </div>
      )}

      <div
        className="kraft-card"
        style={{ maxHeight: 360, overflowY: "auto", marginBottom: "var(--stack-sm)" }}
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
              style={{
                color: m.direction === "outbound" ? "var(--moss)" : "var(--ink-soft)",
                fontSize: 10,
              }}
            >
              {m.direction === "outbound" ? "You" : "Prospect"}
            </span>
            <span
              className="mono"
              style={{ fontSize: 10, color: "var(--outline)", marginLeft: "0.5rem" }}
            >
              {m.sent_at ? new Date(m.sent_at).toLocaleTimeString() : ""}
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
            {m.classification && (
              <p className="mono" style={{ fontSize: 11, color: "var(--moss)" }}>
                classified: {m.classification.label}
                {m.classification.draft_response && ` · draft ready`}
              </p>
            )}
            {m.direction === "inbound" && !m.classification && (
              <div
                style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.25rem" }}
              >
                <button
                  type="button"
                  className="hanko-btn"
                  disabled={classifying === m.id}
                  onClick={() => classifyMessage(m.id)}
                  style={{ fontSize: 11, padding: "0.2rem 0.5rem" }}
                >
                  Auto-classify
                </button>
                {LABELS.slice(0, 4).map((l) => (
                  <button
                    key={l}
                    type="button"
                    className="mono"
                    disabled={classifying === m.id}
                    onClick={() => classifyMessage(m.id, l)}
                    style={{
                      border: "1px solid var(--ink)",
                      background: "transparent",
                      padding: "0.15rem 0.4rem",
                      fontSize: 10,
                      cursor: "pointer",
                    }}
                  >
                    {l.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "var(--stack-sm)" }}>
        <div className="form-line" style={{ flex: 1 }}>
          <label className="mono label-caps" htmlFor="sales-reply">
            Reply
          </label>
          <input
            id="sales-reply"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Draft reply…"
            disabled={sending}
          />
        </div>
        <button
          className="hanko-btn"
          onClick={sendMessage}
          disabled={sending}
          style={{ alignSelf: "flex-end" }}
        >
          Send
        </button>
      </div>

      <button
        type="button"
        className="mono"
        onClick={escalate}
        style={{
          border: "1px solid var(--hanko)",
          color: "var(--hanko)",
          background: "transparent",
          padding: "0.3rem 0.6rem",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Escalate
      </button>
    </div>
  );
}
