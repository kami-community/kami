"use client";

import { useState } from "react";
import ConversationThread from "@/components/ConversationThread";
import { PlatformMark } from "@/components/marketing/platforms";
import NotificationList from "@/components/sales/NotificationList";
import EmptyState from "@/components/ui/EmptyState";
import { IconChat } from "@/components/ui/icons";
import Segmented from "@/components/ui/Segmented";
import { statusTone } from "@/components/ui/Pills";
import type { Conversation, MarketingCrmEntry } from "@/lib/marketingTypes";

type PlatformFilter = "all" | "x" | "instagram";

/** DM conversations, escalations first; open one to read and reply. */
export default function ConversationsPanel({
  conversations,
  entries,
  onRefresh,
}: {
  conversations: Conversation[];
  entries: MarketingCrmEntry[];
  onRefresh: () => void;
}) {
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
      <ConversationThread
        sessionId={selectedEntry.session_id}
        conversation={selected}
        handle={selectedEntry.handle}
        onBack={() => setSelectedId(null)}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <div className="stack">
      <Segmented<PlatformFilter>
        label="Filter by platform"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "x", label: "X" },
          { value: "instagram", label: "Instagram" },
        ]}
      />
      {actionFirst.length === 0 ? (
        <EmptyState title="No active conversations" icon={<IconChat size={16} />}>
          DMs you send from the CRM show up here with replies.
        </EmptyState>
      ) : (
        <NotificationList
          label="Conversations"
          items={actionFirst.map((conv) => {
            const entry = entries.find((e) => e.id === conv.crm_entry_id);
            return {
              key: conv.id,
              kind: conv.status,
              tone: conv.status === "escalated" ? "red" : statusTone(conv.status),
              title: `@${entry?.handle ?? "unknown"}`,
              body:
                conv.escalation_reason ??
                `Updated ${new Date(conv.updated_at).toLocaleDateString()}`,
              icon: <PlatformMark platform={conv.platform} size={18} />,
              onOpen: () => setSelectedId(conv.id),
            };
          })}
        />
      )}
    </div>
  );
}
