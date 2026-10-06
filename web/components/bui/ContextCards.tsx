"use client";

import type { ReactNode } from "react";
import { IconArrowUpRight, IconLines } from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * CONTEXT CARDS
 * Retrieved knowledge chunks with their sources. Chunks enter
 * once (staggered), then the source chips settle in.
 * ───────────────────────────────────────────────────────── */

export type ContextChunk = {
  key: string;
  title: string;
  /** right-hand meta, e.g. "1,250 characters" */
  meta?: string;
  body: ReactNode;
  source?: { label: string; href?: string; badge: string; tone: string };
};

export default function ContextCards({
  chunks,
  header,
  count,
  className,
  action,
}: {
  chunks: ContextChunk[];
  header: string;
  count?: number | string;
  className?: string;
  /** right side of the header row */
  action?: ReactNode;
}) {
  return (
    <div className={`context-cards${className ? ` ${className}` : ""}`}>
      <div className="context-cards__head">
        <span className="context-cards__header">{header}</span>
        {count !== undefined && <span className="count-badge">{count}</span>}
        {action && <span style={{ marginLeft: "auto" }}>{action}</span>}
      </div>

      {chunks.map((chunk, i) => (
        <div
          key={chunk.key}
          className="context-card card"
          style={{
            animation: `fade-up 400ms var(--ease-out-strong) ${Math.min(i, 6) * 100}ms both`,
          }}
        >
          <div className="primitive-card-bar context-card__bar">
            <span className="context-card__title">
              <IconLines size={11} strokeWidth={2.5} />
              <span className="truncate">{chunk.title}</span>
            </span>
            {chunk.meta && <span className="context-card__meta">{chunk.meta}</span>}
          </div>
          <div className="context-card__body">{chunk.body}</div>
          {chunk.source && (
            <div className="context-card__foot">
              {chunk.source.href ? (
                <a
                  href={chunk.source.href}
                  target="_blank"
                  rel="noreferrer"
                  className="context-card__source"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <SourceBadge badge={chunk.source.badge} tone={chunk.source.tone} />
                  <span className="truncate">{chunk.source.label}</span>
                  <IconArrowUpRight size={9} strokeWidth={2.5} />
                </a>
              ) : (
                <span className="context-card__source">
                  <SourceBadge badge={chunk.source.badge} tone={chunk.source.tone} />
                  <span className="truncate">{chunk.source.label}</span>
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SourceBadge({ badge, tone }: { badge: string; tone: string }) {
  return (
    <span className="context-card__badge" style={{ background: tone }}>
      {badge}
    </span>
  );
}
