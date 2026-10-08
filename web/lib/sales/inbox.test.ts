import { describe, expect, it } from "vitest";
import type { SalesNotification } from "@/lib/salesTypes";
import { groupInbox } from "./inbox";

const n = (id: string, kind: SalesNotification["kind"], read: boolean): SalesNotification => ({
  id,
  session_id: "s",
  kind,
  title: id,
  read,
});

describe("groupInbox", () => {
  it("lists every escalation and hides read escalations from notifications", () => {
    const rows = [
      n("esc-unread", "escalation", false),
      n("reply-read", "reply", true),
      n("esc-read", "escalation", true),
      n("meeting", "meeting", false),
    ];
    const view = groupInbox(rows);
    expect(view.escalations.map((r) => r.id)).toEqual(["esc-unread", "esc-read"]);
    expect(view.notifications.map((r) => r.id)).toEqual(["esc-unread", "reply-read", "meeting"]);
    expect(view.unread).toBe(2);
  });

  it("handles an empty inbox", () => {
    expect(groupInbox([])).toEqual({ notifications: [], escalations: [], unread: 0 });
  });
});
