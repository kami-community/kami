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
import { IconArrowLeft, IconSparkle } from "@/components/ui/icons";
import { humanize, StatusPill, statusTone } from "@/components/ui/Pills";
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
  const url = `/api/marketing/conversations/${conversation.id}`;
  const thread = useApi<{ messages: ConversationMessage[] }>(
    withQuery(url, { session_id: sessionId }),
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "error" | "warn"; text: string } | null>(null);
  const replyIdRef = useRef<string | null>(null);
  const messages = thread.data?.messages ?? [];

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
    setResolving(decision);
    try {
      await api.post(url, { action: "resolve", session_id: sessionId, decision });
      onRefresh();
    } catch (err) {
      setNote({ tone: "error", text: errorMessage(err, "Could not save your decision") });
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="conversation fade-up">
      <div className="row row--between conversation__head">
        <Button size="xs" variant="quiet" icon={<IconArrowLeft size={13} />} onClick={onBack}>
          Back to conversations
        </Button>
        <StatusPill tone={statusTone(conversation.status)}>
          {humanize(conversation.status)}
        </StatusPill>
      </div>

      {conversation.status === "escalated" && conversation.escalation_reason && (
        <div className="conversation__head">
          <Callout
            tone="warn"
            title="Needs your decision"
            actions={
              <>
                <Button
                  size="sm"
                  variant="accent"
                  busy={resolving === "approve"}
                  disabled={resolving !== null}
                  onClick={() => void resolve("approve")}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  busy={resolving === "counter"}
                  disabled={resolving !== null}
                  onClick={() => void resolve("counter")}
                >
                  Counter
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  busy={resolving === "decline"}
                  disabled={resolving !== null}
                  onClick={() => void resolve("decline")}
                >
                  Decline
                </Button>
              </>
            }
          >
            {conversation.escalation_reason}
          </Callout>
        </div>
      )}

      <ChatPanel
        label={`Conversation with @${handle}`}
        className="conversation__panel"
        tabs={
          <span className="chat__tab" aria-pressed="true">
            @{handle}
          </span>
        }
        actions={
          <Button
            size="xs"
            variant="quiet"
            icon={<IconSparkle size={12} />}
            busy={suggesting}
            disabled={sending}
            onClick={() => void suggest()}
          >
            Suggest reply
          </Button>
        }
        composer={
          <ChatComposer
            value={input}
            onChange={(v) => {
              setInput(v);
              replyIdRef.current = null; // edited text is a new message
            }}
            onSend={() => void send()}
            busy={sending}
            enterToSend={false}
            sendLabel="Send DM"
            placeholder="Write a reply, or ask Kami to suggest one…"
            label="Your reply"
            footer={<span>Click send to DM @{handle}.</span>}
          />
        }
      >
        <ChatThread>
          {thread.loading && !thread.data && <Skeleton lines={3} />}
          {thread.error && (
            <p className="field__error" role="alert">
              {thread.error}
            </p>
          )}
          {!thread.loading && messages.length === 0 && (
            <p className="text-3 text-sm">No messages yet.</p>
          )}
          {messages.map((m) =>
            m.sender === "kami" ? (
              <div key={m.id}>
                <ChatBubble>{m.content}</ChatBubble>
                {m.status === "failed" && (
                  <p className="field__error conversation__failed">Not delivered</p>
                )}
              </div>
            ) : (
              <ChatSection
                key={m.id}
                label={`@${handle}`}
                sub={new Date(m.sent_at).toLocaleString()}
              >
                <p className="conversation__text">{m.content}</p>
              </ChatSection>
            ),
          )}
        </ChatThread>
      </ChatPanel>

      {note && (
        <div className="dist-note">
          <Callout tone={note.tone}>{note.text}</Callout>
        </div>
      )}
    </div>
  );
}
