"use client";

import { useState, type ReactNode } from "react";
import { monogramColor } from "@/components/ui/Pills";
import {
  IconCheck,
  IconCopy,
  IconReply,
  IconRetry,
  IconThumbDown,
  IconThumbUp,
} from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * STREAMING TEXT
 * A streamed answer: the text arrives with a live caret, then
 * actions (copy · retry · rate) and the cited sources become
 * usable, and follow-up prompts fade up one by one.
 * ───────────────────────────────────────────────────────── */

export type StreamingSource = { name: string; domain: string; href: string };

/** A favicon-style avatar drawn locally (no third-party favicon fetch). */
export function SourceAvatar({ source, size = 14 }: { source: StreamingSource; size?: number }) {
  return (
    <span
      className="source-avatar streaming__avatar"
      style={{ width: size, height: size, background: monogramColor(source.domain) }}
      aria-hidden
    >
      {source.domain.charAt(0).toUpperCase()}
    </span>
  );
}

export function SourceChip({ source }: { source: StreamingSource }) {
  return (
    <a href={source.href} target="_blank" rel="noreferrer" className="source-chip mono">
      <SourceAvatar source={source} size={12} />
      <span>{source.domain}</span>
    </a>
  );
}

export default function StreamingText({
  children,
  streaming,
  sources = [],
  followUps = [],
  copyText,
  onFollowUp,
  onRetry,
  onFeedback,
  labels,
}: {
  /** the (possibly still growing) answer, already rendered */
  children: ReactNode;
  streaming: boolean;
  sources?: StreamingSource[];
  followUps?: string[];
  /** raw text for the copy action */
  copyText?: string;
  onFollowUp?: (text: string, index: number) => void;
  onRetry?: () => void;
  onFeedback?: (rating: "up" | "down") => void;
  labels?: Partial<{ sources: string; followUps: string }>;
}) {
  const l = {
    sources: `${sources.length} source${sources.length === 1 ? "" : "s"}`,
    followUps: "Follow-ups",
    ...labels,
  };
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rated, setRated] = useState<"up" | "down" | null>(null);
  const done = !streaming;

  return (
    <div className="streaming">
      <div className="streaming__text">
        {children}
        {streaming && <span className="streaming__caret" aria-hidden />}
      </div>

      <div className="streaming__actions" data-ready={done}>
        {copyText !== undefined && (
          <button
            type="button"
            aria-label={copied ? "Copied" : "Copy answer"}
            className="streaming__action"
            onClick={() =>
              void navigator.clipboard.writeText(copyText).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              })
            }
          >
            {copied ? (
              <IconCheck size={15} strokeWidth={2.2} />
            ) : (
              <IconCopy size={15} strokeWidth={1.8} />
            )}
          </button>
        )}
        {onRetry && (
          <button
            type="button"
            aria-label="Ask again"
            className="streaming__action"
            onClick={onRetry}
          >
            <IconRetry size={15} strokeWidth={1.8} />
          </button>
        )}
        {onFeedback && (
          <>
            <button
              type="button"
              aria-label="Helpful"
              aria-pressed={rated === "up"}
              className="streaming__action"
              onClick={() => {
                setRated("up");
                onFeedback("up");
              }}
            >
              <IconThumbUp size={15} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Not helpful"
              aria-pressed={rated === "down"}
              className="streaming__action"
              onClick={() => {
                setRated("down");
                onFeedback("down");
              }}
            >
              <IconThumbDown size={15} strokeWidth={1.8} />
            </button>
          </>
        )}
        {sources.length > 0 && (
          <button
            type="button"
            aria-expanded={sourcesOpen}
            onClick={() => setSourcesOpen((c) => !c)}
            className="streaming__sources-toggle"
          >
            <span className="streaming__stack">
              {sources.slice(0, 4).map((source) => (
                <SourceAvatar key={source.href} source={source} />
              ))}
            </span>
            <span>{l.sources}</span>
          </button>
        )}
      </div>

      {sources.length > 0 && (
        <div className="collapse" data-open={done && sourcesOpen}>
          <div className="collapse__inner">
            <div className="streaming__source-list">
              {sources.map((source) => (
                <a
                  key={source.href}
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                  className="streaming__source"
                >
                  <SourceAvatar source={source} size={16} />
                  <span className="animated-underline truncate">{source.name}</span>
                  <span className="streaming__source-domain mono">{source.domain}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {followUps.length > 0 && (
        <div className="streaming__followups" data-ready={done}>
          <p className="streaming__followups-label">{l.followUps}</p>
          <div className="streaming__followup-list">
            {followUps.map((text, i) => (
              <button
                key={text}
                type="button"
                disabled={!done}
                onClick={() => onFollowUp?.(text, i)}
                className="streaming__followup"
                style={
                  done
                    ? { animation: `fade-up 350ms var(--ease-out-strong) ${i * 90}ms both` }
                    : { opacity: 0 }
                }
              >
                <IconReply size={11} style={{ color: "var(--ink-3)" }} />
                {text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
