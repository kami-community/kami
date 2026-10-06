"use client";

import { useRef, useState } from "react";
import {
  ChatBubble,
  ChatComposer,
  ChatPanel,
  ChatSection,
  ChatThread,
} from "@/components/bui/Chat";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { IconArrowLeft, IconWarning } from "@/components/ui/icons";
import { humanize, StatusPill, statusTone } from "@/components/ui/Pills";
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
  /** Inbox already has its own way back; hide this one so the thread isn't a second header. */
  showBack?: boolean;
}

/** One email conversation with a prospect: read, classify replies, answer, escalate. */
export default function SalesConversationThread({
  conversation,
  onBack,
  onRefresh,
  showBack = true,
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
  const latestDraft = [...messages].reverse().find((m) => m.classification?.draft_response)
    ?.classification?.draft_response;

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
      onRefresh();
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
    <div className="conversation fade-up">
      <div className="row row--between" style={{ marginBottom: 12 }}>
        {showBack ? (
          <Button size="xs" variant="quiet" icon={<IconArrowLeft size={13} />} onClick={onBack}>
            Back to inbox
          </Button>
        ) : (
          <span />
        )}
        <span className="row" style={{ gap: 6 }}>
          <StatusPill dot={false}>{humanize(conversation.channel)}</StatusPill>
          <StatusPill tone={statusTone(conversation.status)}>
            {humanize(conversation.status)}
          </StatusPill>
        </span>
      </div>

      {conversation.status === "escalated" && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="warn">Escalated — this one needs your decision before any reply.</Callout>
        </div>
      )}

      <ChatPanel
        label="Conversation"
        className="conversation__panel"
        tabs={
          <span className="chat__tab" aria-pressed="true">
            Thread
          </span>
        }
        actions={
          <Button
            size="xs"
            variant="quiet"
            icon={<IconWarning size={13} />}
            onClick={() => void escalate()}
          >
            Escalate
          </Button>
        }
        composer={
          <ChatComposer
            value={input}
            onChange={(v) => {
              setInput(v);
              replyIdRef.current = null; // edited text is a new message
            }}
            onSend={() => void sendMessage()}
            busy={sending}
            enterToSend={false}
            sendLabel="Send email reply"
            placeholder="Write a reply… (sending is a real email)"
            label="Your reply"
            footer={
              latestDraft && !input ? (
                <button
                  type="button"
                  className="chat__suggestion"
                  onClick={() => setInput(latestDraft)}
                >
                  Use Kami’s suggested reply
                </button>
              ) : (
                <span>Click send to email this reply.</span>
              )
            }
          />
        }
      >
        <ChatThread>
          {thread.loading && !thread.data && <Skeleton lines={3} />}
          {thread.error && <p className="field__error">{thread.error}</p>}
          {!thread.loading && messages.length === 0 && (
            <p className="text-3 text-sm">No messages yet.</p>
          )}
          {messages.map((m) =>
            m.direction === "outbound" ? (
              <ChatBubble key={m.id}>{m.content}</ChatBubble>
            ) : (
              <ChatSection
                key={m.id}
                label="Prospect"
                sub={m.sent_at ? new Date(m.sent_at).toLocaleString() : undefined}
              >
                <p className="conversation__text">{m.content}</p>
                {m.classification ? (
                  <span className="row row--wrap" style={{ gap: 6, marginTop: 6 }}>
                    <StatusPill tone={m.classification.escalation_required ? "red" : "accent"}>
                      {humanize(m.classification.label)}
                    </StatusPill>
                    {m.classification.draft_response && (
                      <span className="text-3 text-xs">Draft reply ready</span>
                    )}
                  </span>
                ) : (
                  <div
                    className="row row--wrap"
                    role="group"
                    aria-label="Classify this reply"
                    style={{ gap: 4, marginTop: 6 }}
                  >
                    <Button
                      size="xs"
                      variant="secondary"
                      busy={classifying === m.id}
                      onClick={() => void classifyMessage(m.id)}
                    >
                      Auto-classify
                    </Button>
                    {MANUAL_LABELS.map((l) => (
                      <Button
                        key={l}
                        size="xs"
                        variant="quiet"
                        disabled={classifying === m.id}
                        onClick={() => void classifyMessage(m.id, l)}
                      >
                        {humanize(l)}
                      </Button>
                    ))}
                  </div>
                )}
              </ChatSection>
            ),
          )}
        </ChatThread>
      </ChatPanel>

      {error && (
        <div style={{ marginTop: 12 }}>
          <Callout tone="error">{error}</Callout>
        </div>
      )}
    </div>
  );
}
