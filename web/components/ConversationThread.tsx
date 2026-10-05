"use client";

import { useRef, useState } from "react";
import EscalationBanner from "@/components/EscalationBanner";
import Callout from "@/components/ui/Callout";
import Skeleton from "@/components/ui/Skeleton";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { Conversation, ConversationMessage } from "@/lib/marketingTypes";

interface ConversationThreadProps {
  sessionId: string;
  conversation: Conversation;
  handle: string;
  onBack: () => void;
  onRefresh: () => void;
}

interface Suggestion {
  draft: string;
  escalate: boolean;
  reason: string;
}

/** One DM conversation: read the thread, get a suggested reply, edit, send. */
export default function ConversationThread({
  sessionId,
  conversation,
  handle,
  onBack,
  onRefresh,
}: ConversationThreadProps) {
  const thread = useApi<{ messages: ConversationMessage[] }>(
    withQuery(`/api/marketing/conversations/${conversation.id}`, { session_id: sessionId }),
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [note, setNote] = useState<{ tone: "error" | "warn"; text: string } | null>(null);
  const replyIdRef = useRef<string | null>(null);
  const messages = thread.data?.messages ?? [];
  const url = `/api/marketing/conversations/${conversation.id}`;

  async function suggest() {
    setSuggesting(true);
    setNote(null);
    try {
      const s = await api.post<Suggestion>(url, { action: "suggest", session_id: sessionId });
      if (s.escalate)
        setNote({
          tone: "warn",
          text: `Your call: ${s.reason || "this needs a decision from you."}`,
        });
      if (s.draft) {
        setInput(s.draft);
        replyIdRef.current = null;
      }
    } catch (err) {
      setNote({ tone: "error", text: errorMessage(err, "Could not suggest a reply") });
    } finally {
      setSuggesting(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    // One id per composed message: retries of the same text never send twice.
    replyIdRef.current ??= crypto.randomUUID();
    setSending(true);
    setNote(null);
    try {
      await api.post(url, {
        action: "reply",
        session_id: sessionId,
        content: text,
        client_message_id: replyIdRef.current,
      });
      setInput("");
      replyIdRef.current = null;
      thread.reload();
    } catch (err) {
      setNote({ tone: "error", text: errorMessage(err, "Message not sent") });
    } finally {
      setSending(false);
    }
  }

  async function resolve(decision: "approve" | "counter" | "decline") {
    try {
      await api.post(url, { action: "resolve", session_id: sessionId, decision });
      onRefresh();
    } catch (err) {
      setNote({ tone: "error", text: errorMessage(err, "Could not save your decision") });
    }
  }

  return (
    <div className="thread fade-in">
      <button type="button" className="link-button mono" onClick={onBack}>
        ← back to conversations
      </button>
      <p className="label-caps">
        @{handle} · {conversation.status.replace(/_/g, " ")}
      </p>

      {conversation.status === "escalated" && conversation.escalation_reason && (
        <EscalationBanner
          reason={conversation.escalation_reason}
          onApprove={() => resolve("approve")}
          onCounter={() => resolve("counter")}
          onDecline={() => resolve("decline")}
        />
      )}

      <div className="thread__messages kraft-card" aria-live="polite">
        {thread.loading && !thread.data && <Skeleton lines={3} />}
        {thread.error && <p className="form-error mono">{thread.error}</p>}
        {!thread.loading && messages.length === 0 && <p className="muted mono">No messages yet.</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`thread__message thread__message--${m.sender === "kami" ? "out" : "in"}`}
          >
            <span className="label-caps">{m.sender === "kami" ? "You" : `@${handle}`}</span>
            <time className="mono fine-print" dateTime={m.sent_at}>
              {new Date(m.sent_at).toLocaleString()}
            </time>
            <p>{m.content}</p>
            {m.status === "failed" && <span className="mono form-error">Not delivered</span>}
          </div>
        ))}
      </div>

      {note && <Callout tone={note.tone}>{note.text}</Callout>}

      <div className="thread__composer">
        <div className="form-line">
          <label className="mono label-caps" htmlFor="manual-msg">
            Your reply
          </label>
          <textarea
            id="manual-msg"
            rows={3}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              replyIdRef.current = null; // edited text is a new message
            }}
            placeholder="Write a reply, or ask Kami to suggest one…"
            disabled={sending}
          />
        </div>
        <div className="thread__actions">
          <button
            type="button"
            className="btn-outline mono"
            onClick={suggest}
            disabled={suggesting || sending}
          >
            {suggesting ? "Drafting…" : "Suggest reply"}
          </button>
          <button
            type="button"
            className="hanko-btn"
            onClick={send}
            disabled={sending || !input.trim()}
          >
            {sending ? "Sending…" : "Send DM"}
          </button>
        </div>
      </div>
    </div>
  );
}
