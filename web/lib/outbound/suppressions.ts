import type { Db } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";

/**
 * One suppression list for every channel. A row with `session_id = null`
 * applies to all campaigns; `channel = null` applies to every channel.
 */

export type SuppressionChannel = "email" | "x" | "instagram";

export interface Suppression {
  id: string;
  session_id: string | null;
  channel: SuppressionChannel | null;
  identifier: string;
  reason: string;
  source: string;
  actor: string;
  created_at: string;
}

/** The identifiers a recipient can be suppressed under: the address/handle and, for email, its domain. */
export function suppressionKeys(recipient: string): string[] {
  const normalized = recipient.trim().toLowerCase();
  if (normalized.includes("@") && !normalized.startsWith("@")) {
    return [normalized, normalized.split("@")[1]];
  }
  const handle = normalized.replace(/^@/, "");
  return [`@${handle}`, handle];
}

export async function findSuppression(
  db: Db,
  params: { sessionId: string; channel: SuppressionChannel; recipient: string },
): Promise<Suppression | null> {
  const { data, error } = await db
    .from("suppressions")
    .select("*")
    .in("identifier", suppressionKeys(params.recipient));
  if (error) throw new AppError("internal", error.message);
  return (
    ((data ?? []) as Suppression[]).find(
      (row) =>
        (row.session_id === null || row.session_id === params.sessionId) &&
        (row.channel === null || row.channel === params.channel),
    ) ?? null
  );
}

export async function addSuppression(
  db: Db,
  params: {
    sessionId: string | null;
    channel: SuppressionChannel | null;
    identifier: string;
    reason: string;
    source: string;
    actor?: string;
  },
): Promise<Suppression> {
  const { data, error } = await db
    .from("suppressions")
    .upsert(
      {
        session_id: params.sessionId,
        channel: params.channel,
        identifier: params.identifier.trim().toLowerCase(),
        reason: params.reason,
        source: params.source,
        actor: params.actor ?? "user",
      },
      { onConflict: "session_id,identifier,channel" },
    )
    .select("*")
    .single();
  if (error) throw new AppError("internal", `could not add suppression: ${error.message}`);
  return data as Suppression;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listSuppressions(db: Db, sessionId: string): Promise<Suppression[]> {
  // Guard the value interpolated into the PostgREST filter below.
  if (!UUID.test(sessionId)) throw new AppError("bad_request", "invalid session id");
  const { data, error } = await db
    .from("suppressions")
    .select("*")
    .or(`session_id.is.null,session_id.eq.${sessionId}`)
    .order("created_at", { ascending: false });
  if (error) throw new AppError("internal", error.message);
  return (data ?? []) as Suppression[];
}

/** Remove a suppression visible to this campaign (its own or a global one). */
export async function removeSuppression(db: Db, sessionId: string, id: string): Promise<void> {
  if (!UUID.test(sessionId)) throw new AppError("bad_request", "invalid session id");
  const { error } = await db
    .from("suppressions")
    .delete()
    .eq("id", id)
    .or(`session_id.is.null,session_id.eq.${sessionId}`);
  if (error) throw new AppError("internal", error.message);
}
