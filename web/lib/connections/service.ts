import type { Db } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { isSealed, seal, unseal } from "./crypto";
import { OAUTH_PROVIDERS, type Platform, type TokenSet } from "./providers";

/**
 * Connected social accounts: one per (session, platform), tokens sealed at rest,
 * refreshed transparently before expiry.
 */

export interface Connection {
  platform: Platform;
  handle: string;
  externalUserId: string | null;
  accessToken: string;
}

export interface ConnectionSummary {
  id: string;
  platform: Platform;
  handle: string | null;
  status: string;
  created_at: string;
}

const LABEL: Record<Platform, string> = { x: "X", instagram: "Instagram" };

/** Reads tokens from either the sealed format or the legacy plaintext `{ oauth2 }` shape. */
function readTokens(stored: unknown): TokenSet | null {
  if (isSealed(stored)) return unseal<TokenSet>(stored);
  const legacy = (stored as { oauth2?: TokenSet } | null)?.oauth2;
  return legacy?.access_token ? legacy : null;
}

export async function saveConnection(
  db: Db,
  params: {
    sessionId: string;
    platform: Platform;
    tokens: TokenSet;
    profile: { id: string; handle: string };
  },
): Promise<void> {
  const { error } = await db.from("connected_accounts").upsert(
    {
      session_id: params.sessionId,
      platform: params.platform,
      handle: params.profile.handle,
      external_user_id: params.profile.id || null,
      status: "connected",
      oauth: seal(params.tokens),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id,platform" },
  );
  if (error)
    throw new AppError(
      "internal",
      `could not save ${LABEL[params.platform]} connection: ${error.message}`,
    );
}

/** The session's connection with a valid access token, or a 400 explaining how to connect. */
export async function requireConnection(
  db: Db,
  sessionId: string,
  platform: Platform,
): Promise<Connection> {
  const { data, error } = await db
    .from("connected_accounts")
    .select("id, handle, external_user_id, oauth")
    .eq("session_id", sessionId)
    .eq("platform", platform)
    .eq("status", "connected")
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);

  const tokens = data ? readTokens(data.oauth) : null;
  if (!data || !tokens) {
    throw new AppError(
      "bad_request",
      `No ${LABEL[platform]} account is connected for this campaign — connect one first`,
      {
        needs_connection: platform,
      },
    );
  }

  const provider = OAUTH_PROVIDERS[platform];
  let current = tokens;
  if (tokens.expires_at <= Date.now() + provider.refreshWindowMs) {
    current = await provider.refresh(tokens);
    await db
      .from("connected_accounts")
      .update({ oauth: seal(current), updated_at: new Date().toISOString() })
      .eq("id", data.id);
  } else if (!isSealed(data.oauth)) {
    // Legacy plaintext row — seal it now.
    await db
      .from("connected_accounts")
      .update({ oauth: seal(current) })
      .eq("id", data.id);
  }

  return {
    platform,
    handle: data.handle ?? "",
    externalUserId: data.external_user_id ?? null,
    accessToken: current.access_token,
  };
}

export async function listConnections(db: Db, sessionId: string): Promise<ConnectionSummary[]> {
  const { data, error } = await db
    .from("connected_accounts")
    .select("id, platform, handle, status, created_at")
    .eq("session_id", sessionId)
    .order("created_at");
  if (error) throw new AppError("internal", error.message);
  return (data ?? []) as ConnectionSummary[];
}

export async function disconnect(db: Db, sessionId: string, platform: Platform): Promise<void> {
  const { error } = await db
    .from("connected_accounts")
    .delete()
    .eq("session_id", sessionId)
    .eq("platform", platform);
  if (error) throw new AppError("internal", error.message);
}
