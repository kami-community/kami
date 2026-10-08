"use client";

import type { ReactNode } from "react";
import GlideMenu from "@/components/bui/GlideMenu";
import { IconChevronRight } from "@/components/ui/icons";
import { humanize, StatusPill, type Tone } from "@/components/ui/Pills";

export interface NotificationItem {
  key: string;
  kind: string;
  tone?: Tone;
  title: string;
  body?: string | null;
  at?: string | null;
  icon?: ReactNode;
  onOpen?: () => void;
}

/** A card of actionable rows with a gliding hover — replies, meetings, tasks. */
export default function NotificationList({
  items,
  label,
}: {
  items: NotificationItem[];
  label: string;
}) {
  return (
    <div className="card notif-list" role="list" aria-label={label}>
      <GlideMenu rowSelector="[data-menu-row]" highlightClassName="notif-list__glide">
        {items.map((n, i) => (
          <button
            key={n.key}
            type="button"
            role="listitem"
            data-menu-row
            className="notif"
            onClick={n.onOpen}
            disabled={!n.onOpen}
            style={{
              animation: `fade-up 360ms var(--ease-out-strong) ${Math.min(i, 8) * 50}ms both`,
            }}
          >
            {n.icon && <span className="notif__icon">{n.icon}</span>}
            <span className="notif__copy">
              <span className="notif__head">
                <StatusPill tone={n.tone ?? "neutral"}>{humanize(n.kind)}</StatusPill>
                {n.at && <span className="notif__at">{new Date(n.at).toLocaleDateString()}</span>}
              </span>
              <span className="notif__title">{n.title}</span>
              {n.body && <span className="notif__body">{n.body}</span>}
            </span>
            {n.onOpen && <IconChevronRight size={14} className="notif__chevron" />}
          </button>
        ))}
      </GlideMenu>
    </div>
  );
}
