/** The kinds of work the Inbox collects, in the order it lists them. Browser-safe. */
export type InboxItemType = "reply" | "meeting" | "draft" | "opportunity" | "task";

export const INBOX_ORDER: readonly InboxItemType[] = [
  "reply",
  "meeting",
  "draft",
  "opportunity",
  "task",
];
