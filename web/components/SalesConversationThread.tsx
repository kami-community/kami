"use client";

import { useRef, useState } from "react";
import Callout from "@/components/ui/Callout";
import Skeleton from "@/components/ui/Skeleton";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
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

/** Labels a founder can apply by hand; the rest come from auto-classification. */
const MANUAL_LABELS: ReplyClassificationLabel[] = [
  "positive",
  "objection",
  "information_request",
  "referral",
];

interface SalesConversationThreadProps {
  conversation: SalesConversation;
  onBack: () => void;
  onRefresh: () => void;
}

/** One email conversation with a prospect: read, classify replies, answer, escalate. */
export default function SalesConversationThread({
  conversation,
  onBack,
  onRefresh,
}: SalesConversationThreadProps) {
  const url = `/api/sales/conversations/${conversation.id}`;
  const thread = useApi<{ messages: MessageWithClassification[] }>(
    withQuery(url, { session_id: conversation.session_id }),
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [classifying, setClassifying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const replyIdRef = useRef<string | null>(null);
  const messages = thread.data?.messages ?? [];

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    // One id per composed message: retries of the same text never send twice.
    replyIdRef.current ??= crypto.randomUUID();
    setSending(true);
    setError(null);
    try {
      await api.post(url, {
        action: "reply",
        session_id: conversation.session_id,
        content: text,
        client_message_id: replyIdRef.current,
      });
      setInput("");
      replyIdRef.current = null;
      thread.reload();
    } catch (err) {
      setError(errorMessage(err, "Reply not sent"));
    } finally {
      setSending(false);
    }
  }

  async function classifyMessage(messageId: string, label?: ReplyClassificationLabel) {
    setClassifying(messageId);
    setError(null);
    try {
      await api.post(url, {
        action: "classify",
        session_id: conversation.session_id,
        message_id: messageId,
        label,
      });
      thread.reload();
      onRefresh();
    } catch (err) {
      setError(errorMessage(err, "Could not classify this reply"));
    } finally {
      setClassifying(null);
    }
  }

  async function escalate() {
    setError(null);
    try {
      await api.post(url, {
        action: "escalate",
        session_id: conversation.session_id,
        reason: "Manual review requested",
      });
      onRefresh();
    } catch (err) {
      setError(errorMessage(err, "Could not escalate"));
    }
  }

  return (
    <div className="thread fade-in">
      <button type="button" className="link-button mono" onClick={onBack}>
        ← back to inbox
      </button>
      <p className="label-caps">
        {conversation.channel} · {conversation.status.replace(/_/g, " ")}
      </p>

      {conversation.status === "escalated" && (
        <Callout tone="warn">Escalated — this one needs your decision before any reply.</Callout>
      )}

      <div className="thread__messages kraft-card" aria-live="polite">
        {thread.loading && !thread.data && <Skeleton lines={3} />}
        {thread.error && <p className="form-error mono">{thread.error}</p>}
        {!thread.loading && messages.length === 0 && <p className="muted mono">No messages yet.</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`thread__message thread__message--${m.direction === "outbound" ? "out" : "in"}`}
          >
            <span className="label-caps">{m.direction === "outbound" ? "You" : "Prospect"}</span>
            {m.sent_at && (
              <time className="mono fine-print" dateTime={m.sent_at}>
                {new Date(m.sent_at).toLocaleString()}
              </time>
            )}
            <p>{m.content}</p>
            {m.classification && (
              <p className="mono fine-print">
                classified: {m.classification.label.replace(/_/g, " ")}
                {m.classification.draft_response && " · draft ready"}
              </p>
            )}
            {m.direction === "inbound" && !m.classification && (
              <div className="chip-row" role="group" aria-label="Classify this reply">
                <button
                  type="button"
                  className="btn-outline mono"
                  disabled={classifying === m.id}
                  onClick={() => classifyMessage(m.id)}
                >
                  {classifying === m.id ? "Classifying…" : "Auto-classify"}
                </button>
                {MANUAL_LABELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className="chip"
                    disabled={classifying === m.id}
                    onClick={() => classifyMessage(m.id, l)}
                  >
                    {l.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <Callout tone="error">{error}</Callout>}

      <div className="thread__composer">
        <div className="form-line">
          <label className="mono label-caps" htmlFor="sales-reply">
            Your reply
          </label>
          <textarea
            id="sales-reply"
            rows={3}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              replyIdRef.current = null; // edited text is a new message
            }}
            placeholder="Write a reply…"
            disabled={sending}
          />
        </div>
        <div className="thread__actions">
          <button type="button" className="btn-outline mono" onClick={escalate}>
            Escalate
          </button>
          <button
            type="button"
            className="hanko-btn"
            onClick={sendMessage}
            disabled={sending || !input.trim()}
          >
            {sending ? "Sending…" : "Send email"}
          </button>
        </div>
      </div>
    </div>
  );
}
