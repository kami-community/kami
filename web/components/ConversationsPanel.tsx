"use client";

import { useState } from "react";
import type { Conversation, MarketingCrmEntry } from "@/lib/marketingTypes";
import StatusChip from "@/components/StatusChip";
import ConversationThread from "@/components/ConversationThread";

type PlatformFilter = "all" | "x" | "instagram";

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
          conversation={selected}
          handle={selectedEntry.handle}
          onBack={() => setSelectedId(null)}
          onRefresh={onRefresh}
        />
      </aside>
    );
  }

  return (
    <aside>
      <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
        Conversations
      </p>
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "var(--stack-sm)" }}>
        {(["all", "x", "instagram"] as PlatformFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            className="mono"
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "var(--kraft)" : "transparent",
              border: "1px solid var(--ink)",
              padding: "0.2rem 0.5rem",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            {f === "all" ? "All" : f === "x" ? "X" : "IG"}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack-sm)" }}>
        {actionFirst.length === 0 && (
          <p className="mono" style={{ color: "var(--ink-soft)" }}>
            No active conversations.
          </p>
        )}
        {actionFirst.map((conv) => {
          const entry = entries.find((e) => e.id === conv.crm_entry_id);
          return (
            <button
              key={conv.id}
              type="button"
              className="kraft-card"
              onClick={() => setSelectedId(conv.id)}
              style={{ padding: "0.75rem 1rem", cursor: "pointer", textAlign: "left" }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <strong style={{ fontFamily: "var(--font-headline)", fontSize: 14 }}>
                  @{entry?.handle ?? "unknown"}
                </strong>
                <StatusChip label={conv.status} />
              </div>
              {conv.escalation_reason && (
                <p
                  className="mono"
                  style={{ fontSize: 11, color: "var(--hanko)", marginTop: "0.3rem" }}
                >
                  ⚠ {conv.escalation_reason}
                </p>
              )}
              <p
                className="mono"
                style={{ fontSize: 11, color: "var(--outline)", marginTop: "0.2rem" }}
              >
                {conv.platform} · updated {new Date(conv.updated_at).toLocaleDateString()}
              </p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
