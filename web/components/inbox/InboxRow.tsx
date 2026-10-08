"use client";

import type { ReactNode } from "react";
import {
  IconCalendar,
  IconCheckCircle,
  IconChevronRight,
  IconMail,
  IconMegaphone,
  IconReply,
  IconWarning,
} from "@/components/ui/icons";
import type { InboxItem, InboxItemType } from "@/lib/inbox/inbox";
import { timeAgo } from "./format";

/** Labels per kind of waiting work: filter chip, row badge, and the row's action. */
export const INBOX_TYPES: Record<InboxItemType, { label: string; filter: string; action: string }> =
  {
    reply: { label: "Reply", filter: "Replies", action: "Answer" },
    meeting: { label: "Meeting", filter: "Meetings", action: "Schedule" },
    draft: { label: "Email to review", filter: "Emails to review", action: "Review" },
    opportunity: { label: "Opportunity", filter: "Opportunities", action: "Review" },
    task: { label: "Task", filter: "Tasks", action: "Do it" },
  };

export function inboxIcon(item: InboxItem, size = 15): ReactNode {
  switch (item.type) {
    case "reply":
      return item.notification.kind === "escalation" ? (
        <IconWarning size={size} />
      ) : (
        <IconReply size={size} />
      );
    case "meeting":
      return <IconCalendar size={size} />;
    case "draft":
      return <IconMail size={size} />;
    case "opportunity":
      return <IconMegaphone size={size} />;
    case "task":
      return <IconCheckCircle size={size} />;
  }
}

function badge(item: InboxItem): string {
  if (item.type === "reply" && item.notification.kind !== "reply")
    return item.notification.kind === "escalation" ? "Escalation" : "Alert";
  return INBOX_TYPES[item.type].label;
}

/**
 * One row of waiting work: type icon, title, one line of context, time and the
 * action it leads to. A button; the parent decides what opening it does.
 */
export default function InboxRow({
  item,
  selected = false,
  onOpen,
}: {
  item: InboxItem;
  selected?: boolean;
  onOpen: () => void;
}) {
  const escalation = item.type === "reply" && item.notification.kind === "escalation";
  return (
    <button
      type="button"
      className={`inbox-row${escalation ? " inbox-row--alert" : ""}`}
      aria-current={selected || undefined}
      onClick={onOpen}
    >
      <span className={`inbox-row__icon inbox-row__icon--${item.type}`}>{inboxIcon(item)}</span>
      <span className="inbox-row__copy">
        <span className="inbox-row__head">
          <span className="inbox-row__kind">{badge(item)}</span>
          {item.at && (
            <time className="inbox-row__at" dateTime={item.at}>
              {timeAgo(item.at)}
            </time>
          )}
        </span>
        <span className="inbox-row__title">{item.title}</span>
        <span className="inbox-row__context">{item.context}</span>
      </span>
      <span className="inbox-row__action">
        {INBOX_TYPES[item.type].action}
        <IconChevronRight size={13} />
      </span>
    </button>
  );
}
