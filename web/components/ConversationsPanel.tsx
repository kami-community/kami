"use client";

import { useState } from "react";
import type { Conversation, MarketingCrmEntry } from "@/lib/marketingTypes";
import StatusChip from "@/components/StatusChip";
import ConversationThread from "@/components/ConversationThread";

type PlatformFilter = "all" | "x" | "instagram";

const FILTER_LABEL: Record<PlatformFilter, string> = { all: "All", x: "X", instagram: "IG" };

interface ConversationsPanelProps {
  conversations: Conversation[];
  entries: MarketingCrmEntry[];
  onRefresh: () => void;
}

export default function ConversationsPanel({
  conversations,
  entries,
  onRefresh,
}: ConversationsPanelProps) {
  const [filter, setFilter] = useState<PlatformFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered =
    filter === "all" ? conversations : conversations.filter((c) => c.platform === filter);
  const actionFirst = [...filtered].sort((a, b) => {
    if (a.status === "escalated" && b.status !== "escalated") return -1;
    if (b.status === "escalated" && a.status !== "escalated") return 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const selected = selectedId ? conversations.find((c) => c.id === selectedId) : null;
  const selectedEntry = selected ? entries.find((e) => e.id === selected.crm_entry_id) : null;

  if (selected && selectedEntry) {
    return (
      <aside>
        <ConversationThread
          sessionId={selectedEntry.session_id}
          conversation={selected}
          handle={selectedEntry.handle}
          onBack={() => setSelectedId(null)}
          onRefresh={onRefresh}
        />
      </aside>
    );
  }

  return (
    <aside aria-labelledby="conversations-title">
      <p id="conversations-title" className="label-caps">
        Conversations
      </p>
      <div className="chip-row" role="group" aria-label="Filter by platform">
        {(Object.keys(FILTER_LABEL) as PlatformFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            className="chip-toggle chip-toggle--small"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="card-list panel-section">
        {actionFirst.length === 0 && <p className="fine-print">No active conversations.</p>}
        {actionFirst.map((conv) => {
          const entry = entries.find((e) => e.id === conv.crm_entry_id);
          return (
            <button
              key={conv.id}
              type="button"
              className="kraft-card entity-card"
              onClick={() => setSelectedId(conv.id)}
            >
              <span className="entity-card__row">
                <strong className="entity-card__name">@{entry?.handle ?? "unknown"}</strong>
                <StatusChip label={conv.status} />
              </span>
              {conv.escalation_reason && (
                <span className="fine-print fine-print--alert notice-card__body">
                  ⚠ {conv.escalation_reason}
                </span>
              )}
              <span className="fine-print notice-card__body">
                {conv.platform} · updated {new Date(conv.updated_at).toLocaleDateString()}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
