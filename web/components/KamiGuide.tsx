"use client";

import { useEffect, useRef, useState } from "react";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import RichText from "@/components/ui/RichText";
import { postStream } from "@/lib/client/stream";
import type { CampaignTab } from "@/lib/marketingTypes";

interface Message {
  id: number;
  role: "you" | "guide";
  text: string;
  error?: boolean;
}

interface KamiGuideProps {
  activeTab: CampaignTab;
  collapsed: boolean;
  onToggle: () => void;
}

const JOB_FOR_TAB: Record<CampaignTab, "find_customers" | "create_distribution" | null> = {
  overview: null,
  sales: "find_customers",
  marketing: "create_distribution",
};

/** Kami Guide: grounded Q&A on every tab. The server rebuilds the context pack each turn. */
export default function KamiGuide({ activeTab, collapsed, onToggle }: KamiGuideProps) {
  const { sessionId } = useCampaign();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    const questionId = nextId.current++;
    const answerId = nextId.current++;
    setInput("");
    setBusy(true);
    setMessages((m) => [
      ...m,
      { id: questionId, role: "you", text: question },
      { id: answerId, role: "guide", text: "" },
    ]);
    const update = (fn: (msg: Message) => Message) =>
      setMessages((m) => m.map((msg) => (msg.id === answerId ? fn(msg) : msg)));

    try {
      await postStream(
        "/api/guide",
        { session_id: sessionId, question, active_job: JOB_FOR_TAB[activeTab] },
        (delta) => update((msg) => ({ ...msg, text: msg.text + delta })),
      );
    } catch (err) {
      update((msg) => ({
        ...msg,
        error: true,
        text: err instanceof Error ? err.message : "Kami Guide is unavailable",
      }));
    } finally {
      setBusy(false);
    }
  }

  if (collapsed) {
    return (
      <button type="button" className="btn-secondary kami-guide-fab" onClick={onToggle}>
        Ask Kami
      </button>
    );
  }

  return (
    <aside className="kami-guide" aria-label="Kami Guide">
      <div className="kami-guide__head">
        <div className="kami-guide__title">
          <h3>Kami Guide</h3>
          <button type="button" className="mono link-button" onClick={onToggle}>
            hide
          </button>
        </div>
        <p className="mono meta-line">
          Grounded in your dossier and current {activeTab} state. It cannot send or publish for you.
        </p>
      </div>

      <div ref={listRef} className="kami-guide__messages" aria-live="polite">
        {messages.length === 0 && (
          <p className="kami-guide-message muted">
            Ask: “What should I do next?” or “Why is this company a fit?”
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id}>
            <span className="label-caps">{m.role === "you" ? "You" : "Kami"}</span>
            <div
              className={`kami-guide-message${m.error ? " form-error" : ""}`}
              role={m.error ? "alert" : undefined}
            >
              {m.role === "guide" && !m.error ? <RichText text={m.text || "…"} /> : m.text || "…"}
            </div>
          </div>
        ))}
      </div>

      <form
        className="kami-guide__composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="form-line">
          <label className="mono label-caps" htmlFor="kami-guide-input">
            Your question
          </label>
          <input
            id="kami-guide-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What should I do next?"
            disabled={busy}
          />
        </div>
        <button type="submit" className="btn-secondary" disabled={busy || !input.trim()}>
          {busy ? "…" : "Ask"}
        </button>
      </form>
    </aside>
  );
}
