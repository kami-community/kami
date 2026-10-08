"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatBubble, ChatPanel, ChatSection, ChatTab, ChatThread } from "@/components/bui/Chat";
import PromptBar, { type PromptCommand, type PromptSource } from "@/components/bui/PromptBar";
import StreamingText from "@/components/bui/StreamingText";
import ThinkingState, { type ThinkingRow } from "@/components/bui/ThinkingState";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import { IconButton } from "@/components/ui/Button";
import {
  IconBuilding,
  IconClose,
  IconDoc,
  IconMail,
  IconMegaphone,
  IconPlus,
  IconTarget,
  IconUsers,
} from "@/components/ui/icons";
import RichText from "@/components/ui/RichText";
import { errorMessage } from "@/lib/client/api";
import type { View } from "@/lib/client/routes";
import { postEvents } from "@/lib/client/stream";
import type { GuideSource } from "@/lib/domain/guideEvents";

/**
 * Kami Guide: grounded Q&A on every screen. The server rebuilds the context
 * pack each turn and streams typed events — context (sources), text deltas,
 * follow-ups, done/error — which render as a thinking trace, a streamed
 * answer with sources, and follow-up prompts. The guide never sends anything.
 */

type Focus = "overview" | "find_customers" | "create_distribution";

interface Turn {
  id: number;
  question: string;
  focus: Focus;
  answer: string;
  sources: GuideSource[];
  followUps: string[];
  phase: "context" | "streaming" | "done" | "error";
  error?: string;
  durationMs?: number;
}

const FOCUS_OPTIONS = [
  { key: "overview", name: "Whole campaign", tag: "Campaign" },
  { key: "find_customers", name: "Find customers", tag: "Sales" },
  { key: "create_distribution", name: "Distribution", tag: "Marketing" },
];

const FOCUS_LABEL: Record<Focus, string> = {
  overview: "Whole campaign",
  find_customers: "Find customers",
  create_distribution: "Distribution",
};

const SOURCES: PromptSource[] = [
  { key: "dossier", name: "Dossier", desc: "Positioning, voice, ICP", icon: <IconDoc size={15} /> },
  { key: "segments", name: "Segments", desc: "Who you sell to", icon: <IconUsers size={15} /> },
  { key: "plan", name: "Plan", desc: "Outbound motions & tiers", icon: <IconTarget size={15} /> },
  {
    key: "companies",
    name: "Companies",
    desc: "Verified accounts",
    icon: <IconBuilding size={15} />,
  },
  {
    key: "drafts",
    name: "Drafts",
    desc: "Emails waiting for review",
    icon: <IconMail size={15} />,
  },
  {
    key: "opportunities",
    name: "Opportunities",
    desc: "Distribution queue",
    icon: <IconMegaphone size={15} />,
  },
];

const COMMANDS: PromptCommand[] = [
  { key: "next", name: "/next", desc: "What to do next", prompt: "What should I do next?" },
  {
    key: "why",
    name: "/why-fit",
    desc: "Why this ICP fits",
    prompt: "Why is my first ICP bucket a good fit?",
  },
  {
    key: "angle",
    name: "/angle",
    desc: "A post angle for this week",
    prompt: "Suggest one distribution angle for this week.",
  },
  {
    key: "triage",
    name: "/triage",
    desc: "What needs me",
    prompt: "What is waiting on me, most important first?",
  },
  {
    key: "review",
    name: "/review",
    desc: "Critique my drafts",
    prompt: "What would make my pending email drafts stronger?",
  },
];

const STARTERS = [
  "What should I do next?",
  "Why is this company a fit?",
  "What would you post this week?",
];

function focusFor(view: View): Focus {
  if (view.area === "sales") return "find_customers";
  if (view.area === "distribution") return "create_distribution";
  return "overview";
}

function contextRows(turn: Turn, packSources: number): ThinkingRow[] {
  const active = turn.phase === "context";
  return [
    { primary: "Building a fresh context pack", secondary: FOCUS_LABEL[turn.focus], state: "done" },
    {
      primary: `Reading ${turn.sources.length || packSources} source${(turn.sources.length || packSources) === 1 ? "" : "s"}`,
      state: turn.sources.length || !active ? "done" : "active",
    },
    {
      primary: "Asking Kami Guide",
      state: active ? (turn.sources.length ? "active" : "todo") : "done",
    },
  ];
}

const storageKey = (sessionId: string) => `kami_guide_${sessionId}`;

function restoreTurns(sessionId: string): Turn[] {
  try {
    const saved =
      typeof window === "undefined" ? null : sessionStorage.getItem(storageKey(sessionId));
    if (!saved) return [];
    return (JSON.parse(saved) as Turn[]).map((t) =>
      t.phase === "done" || t.phase === "error"
        ? t
        : { ...t, phase: "error" as const, error: "Interrupted" },
    );
  } catch {
    return []; // storage blocked or corrupt: start a fresh thread
  }
}

export default function KamiGuide({
  view,
  prompt,
  onClose,
}: {
  view: View;
  /** a question to ask right away (from a screen’s Ask Kami button, ⌘K, or /) */
  prompt: { text: string; n: number } | null;
  onClose: () => void;
}) {
  const { sessionId, session } = useCampaign();
  // this campaign's thread survives reloads (a per-browser convenience); the
  // workspace renders client-side only, so storage can seed the first render
  const [turns, setTurns] = useState<Turn[]>(() => restoreTurns(sessionId));
  const [focus, setFocus] = useState<Focus>(() => focusFor(view));
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(turns.reduce((m, t) => Math.max(m, t.id + 1), 0));
  const packSources = session.research_snapshot?.sources?.length ?? 0;

  /* follow the founder: the focus tracks the area they are in */
  const area = view.area;
  useEffect(() => {
    setFocus(focusFor({ area } as View));
  }, [area]);

  useEffect(() => {
    if (busy) return;
    try {
      sessionStorage.setItem(storageKey(sessionId), JSON.stringify(turns.slice(-20)));
    } catch {
      /* storage blocked: the thread lives for this page only */
    }
  }, [turns, busy, sessionId]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback(
    async (raw: string, askFocus: Focus = focus) => {
      const question = raw.trim();
      if (!question || busy) return;
      const id = nextId.current++;
      const update = (fn: (t: Turn) => Turn) =>
        setTurns((all) => all.map((t) => (t.id === id ? fn(t) : t)));
      setTurns((all) => [
        ...all,
        { id, question, focus: askFocus, answer: "", sources: [], followUps: [], phase: "context" },
      ]);
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await postEvents(
          "/api/guide",
          {
            session_id: sessionId,
            question,
            active_job: askFocus === "overview" ? null : askFocus,
          },
          (e) => {
            switch (e.event) {
              case "context":
                update((t) => ({ ...t, sources: e.data.sources }));
                break;
              case "delta":
                update((t) => ({ ...t, phase: "streaming", answer: t.answer + e.data.text }));
                break;
              case "followups":
                update((t) => ({ ...t, followUps: e.data.items }));
                break;
              case "done":
                update((t) => ({ ...t, phase: "done", durationMs: e.data.durationMs }));
                break;
              case "error":
                update((t) => ({ ...t, phase: "error", error: e.data.error }));
                break;
            }
          },
          controller.signal,
        );
        // a stream that ended without done/error (aborted) settles as stopped
        update((t) =>
          t.phase === "context" || t.phase === "streaming"
            ? { ...t, phase: t.answer ? "done" : "error", error: t.answer ? undefined : "Stopped" }
            : t,
        );
      } catch (err) {
        update((t) => ({
          ...t,
          phase: "error",
          error: errorMessage(err, "Kami Guide is unavailable"),
        }));
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, focus, sessionId],
  );

  /* questions handed over from elsewhere in the workspace */
  const lastPrompt = useRef(0);
  useEffect(() => {
    if (prompt && prompt.n !== lastPrompt.current) {
      lastPrompt.current = prompt.n;
      void ask(prompt.text);
    }
  }, [prompt, ask]);

  return (
    <aside className="app__guide" aria-label="Kami Guide">
      <ChatPanel
        label="Kami Guide conversation"
        className="guide"
        tabs={
          <ChatTab active onClick={() => undefined}>
            Kami Guide
          </ChatTab>
        }
        actions={
          <>
            <IconButton
              label="New conversation"
              size="sm"
              disabled={busy || turns.length === 0}
              onClick={() => setTurns([])}
            >
              <IconPlus size={15} />
            </IconButton>
            <IconButton label="Hide Kami Guide" size="sm" onClick={onClose}>
              <IconClose size={15} />
            </IconButton>
          </>
        }
        composer={
          <PromptBar
            stacked
            placeholder="Ask Kami — @ for context, / for commands"
            sources={SOURCES}
            commands={COMMANDS}
            options={FOCUS_OPTIONS}
            option={focus}
            onOptionChange={(k) => setFocus(k as Focus)}
            onSend={(text) => void ask(text)}
            onStop={() => abortRef.current?.abort()}
            busy={busy}
            label="Ask Kami Guide"
          />
        }
      >
        <ChatThread threadRef={threadRef}>
          {turns.length === 0 && (
            <div className="guide__empty">
              <span className="kami-seal kami-seal--lg" aria-hidden>
                K
              </span>
              <p className="guide__empty-title">Ask anything about your go-to-market</p>
              <p className="guide__empty-body">
                Grounded in your dossier and live campaign state. It recommends — you approve every
                send.
              </p>
              <div className="guide__starters">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="guide__starter"
                    onClick={() => void ask(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => {
            const last = i === turns.length - 1;
            return (
              <div key={t.id} className="guide__turn">
                <ChatBubble>{t.question}</ChatBubble>
                {t.phase === "context" && (
                  <ThinkingState
                    working
                    rows={contextRows(t, packSources)}
                    active="Thinking"
                    done="Thought"
                  />
                )}
                {t.phase === "error" && !t.answer ? (
                  <ChatSection label="Kami" sub={FOCUS_LABEL[t.focus]}>
                    <p className="guide__error" role="alert">
                      {t.error}
                    </p>
                    {last && (
                      <button
                        type="button"
                        className="guide__retry"
                        onClick={() => void ask(t.question, t.focus)}
                      >
                        Try again
                      </button>
                    )}
                  </ChatSection>
                ) : t.phase !== "context" ? (
                  <ChatSection
                    label="Kami"
                    sub={FOCUS_LABEL[t.focus]}
                    time={
                      t.durationMs === undefined
                        ? null
                        : t.durationMs < 1000
                          ? "<1s"
                          : `${Math.round(t.durationMs / 1000)}s`
                    }
                  >
                    <StreamingText
                      streaming={t.phase === "streaming"}
                      sources={t.sources}
                      followUps={last ? t.followUps : []}
                      copyText={t.answer}
                      onFollowUp={(text) => void ask(text)}
                      onRetry={last && !busy ? () => void ask(t.question, t.focus) : undefined}
                    >
                      <RichText text={t.answer} />
                      {t.phase === "error" && t.error && (
                        <p className="guide__error" role="alert">
                          {t.error}
                        </p>
                      )}
                    </StreamingText>
                  </ChatSection>
                ) : null}
              </div>
            );
          })}
        </ChatThread>
      </ChatPanel>
    </aside>
  );
}
