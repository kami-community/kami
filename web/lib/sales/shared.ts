import type { PostgrestError } from "@supabase/supabase-js";
import type { Db } from "@/lib/db/client";
import { AppError, conflict, notFound } from "@/lib/http/errors";
import type { Row } from "./rows";

/** Database plumbing shared by the Sales services. */

/** Turn a Supabase error into an AppError (unique violations become 409s). */
export function dbError(error: PostgrestError, context?: string): AppError {
  const message = context ? `${context}: ${error.message}` : error.message;
  if (error.code === "23505") return conflict(message);
  return new AppError("internal", message);
}

/** The session's Sales campaign row, or 404 when setup has not run yet. */
export async function loadSalesCampaign(db: Db, sessionId: string): Promise<Row> {
  const { data, error } = await db
    .from("sales_campaigns")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw notFound("no sales campaign for this session — run setup first");
  return data as Row;
}

/** A sales account that belongs to this session, or 404. */
export async function loadAccount(db: Db, sessionId: string, accountId: string): Promise<Row> {
  const { data, error } = await db
    .from("sales_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw notFound("account not found for this session");
  return data as Row;
}

/**
 * Guard for autonomous Sales work (agent research, contact lookup): blocked
 * while the campaign kill switch or the Sales-area pause is on.
 */
export function assertSalesActive(session: { paused: boolean }, campaign: Row): void {
  if (session.paused)
    throw new AppError("paused", "Kami is paused for this campaign", { paused: true });
  if (campaign.autonomous_paused) {
    throw new AppError("paused", "sales autonomous actions are paused for this session", {
      paused: true,
    });
  }
}

export interface AuditEntry {
  sessionId: string;
  actor: "user" | "system" | "reviewer";
  action: string;
  entityType: string;
  entityId: string | null;
  payload?: Record<string, unknown>;
}

export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  const { error } = await db.from("sales_audit_events").insert({
    session_id: entry.sessionId,
    actor: entry.actor,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    payload: entry.payload ?? null,
  });
  if (error) throw dbError(error, "could not write the audit event");
}

export const now = () => new Date().toISOString();
