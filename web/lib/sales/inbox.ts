import type { Db } from "@/lib/db/client";
import { AppError, notFound } from "@/lib/http/errors";
import type { SalesNotification } from "@/lib/salesTypes";

/** Sales inbox: notifications (replies, meetings, policy blocks) and escalations for one campaign. */

export interface InboxView {
  /** Non-escalation notifications, plus escalations still unread. */
  notifications: SalesNotification[];
  /** Every escalation, read or not. */
  escalations: SalesNotification[];
  unread: number;
}

function rowToNotification(row: Record<string, unknown>): SalesNotification {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    kind: row.kind as SalesNotification["kind"],
    title: row.title as string,
    body: (row.body as string | null) ?? undefined,
    entity_type: (row.entity_type as string | null) ?? undefined,
    entity_id: (row.entity_id as string | null) ?? undefined,
    read: Boolean(row.read),
    created_at: row.created_at as string | undefined,
  };
}

/** Split notifications into the inbox's two lists. Order is preserved. */
export function groupInbox(rows: SalesNotification[]): InboxView {
  return {
    escalations: rows.filter((n) => n.kind === "escalation"),
    notifications: rows.filter((n) => n.kind !== "escalation" || !n.read),
    unread: rows.filter((n) => !n.read).length,
  };
}

export async function getInbox(db: Db, sessionId: string): Promise<InboxView> {
  const { data, error } = await db
    .from("sales_notifications")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new AppError("internal", error.message);
  return groupInbox((data ?? []).map(rowToNotification));
}

export async function markNotificationRead(
  db: Db,
  params: { sessionId: string; id: string; read: boolean },
): Promise<void> {
  const { data, error } = await db
    .from("sales_notifications")
    .update({ read: params.read })
    .eq("id", params.id)
    .eq("session_id", params.sessionId)
    .select("id")
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("notification not found for this campaign");
}
