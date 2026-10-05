import { randomBytes } from "node:crypto";
import { supabaseServer } from "@/lib/supabase";

// Instagram API with Instagram Login (Business Login for Instagram).
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/

const APP_ID = process.env.INSTAGRAM_APP_ID;
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET;
const REDIRECT_URI =
  process.env.INSTAGRAM_REDIRECT_URI ?? "http://localhost:3000/api/auth/instagram/callback";

const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const LONG_LIVED_URL = "https://graph.instagram.com/access_token";
const REFRESH_URL = "https://graph.instagram.com/refresh_access_token";
const GRAPH = "https://graph.instagram.com";

export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",");

export function igOauthConfigured(): boolean {
  return Boolean(APP_ID && APP_SECRET);
}

export function buildIgAuthUrl(): { url: string; state: string } {
  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: APP_ID!,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: IG_SCOPES,
    state,
  });
  return { url: `${AUTH_URL}?${params}`, state };
}

interface TokenSet {
  access_token: string;
  user_id?: string;
  expires_at: number;
}

async function exchangeCode(code: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: APP_ID!,
    client_secret: APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
    code,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    user_id?: string | number;
    error_message?: string;
    error_type?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_message ??
        `IG token exchange ${res.status}: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }

  // Short-lived → long-lived (~60 days)
  const llRes = await fetch(
    `${LONG_LIVED_URL}?${new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: APP_SECRET!,
      access_token: json.access_token,
    })}`,
  );
  const ll = (await llRes.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  const access = ll.access_token ?? json.access_token;
  const expiresIn = ll.expires_in ?? 3600;
  return {
    access_token: access,
    user_id: json.user_id != null ? String(json.user_id) : undefined,
    expires_at: Date.now() + expiresIn * 1000,
  };
}

export { exchangeCode as exchangeIgCode };

async function refreshLongLived(token: string): Promise<TokenSet> {
  const res = await fetch(
    `${REFRESH_URL}?${new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: token,
    })}`,
  );
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`IG token refresh failed: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return {
    access_token: json.access_token,
    expires_at: Date.now() + (json.expires_in ?? 5_184_000) * 1000,
  };
}

export async function fetchIgProfile(
  accessToken: string,
): Promise<{ id: string; username: string }> {
  const res = await fetch(
    `${GRAPH}/me?${new URLSearchParams({
      fields: "user_id,username",
      access_token: accessToken,
    })}`,
  );
  const json = (await res.json().catch(() => ({}))) as {
    user_id?: string;
    id?: string;
    username?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.username) {
    throw new Error(json.error?.message ?? "could not fetch Instagram profile");
  }
  return { id: String(json.user_id ?? json.id ?? ""), username: json.username };
}

/**
 * Session-scoped Instagram token. Requires sessionId or claimId — never "latest global".
 */
export async function getValidIgAccessToken(lookup: {
  sessionId?: string | null;
  claimId?: string | null;
}): Promise<{ token: string; handle: string; userId?: string } | null> {
  const sb = supabaseServer();
  if (!sb) return null;
  if (!lookup.sessionId && !lookup.claimId) return null;

  let query = sb
    .from("connected_accounts")
    .select("id, handle, oauth")
    .eq("platform", "instagram")
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1);

  if (lookup.sessionId) {
    query = query.eq("session_id", lookup.sessionId);
  } else if (lookup.claimId) {
    query = query.eq("claim_id", lookup.claimId);
  }

  const { data } = await query.maybeSingle();

  const tokens = (data?.oauth as { oauth2?: TokenSet } | null)?.oauth2;
  if (!data || !tokens?.access_token) return null;

  const handle = data.handle ?? "";
  const userId = tokens.user_id;

  if (tokens.expires_at > Date.now() + 7 * 24 * 60 * 60 * 1000) {
    return { token: tokens.access_token, handle, userId };
  }

  try {
    const fresh = await refreshLongLived(tokens.access_token);
    await sb
      .from("connected_accounts")
      .update({ oauth: { oauth2: { ...fresh, user_id: userId } } })
      .eq("id", data.id);
    return { token: fresh.access_token, handle, userId };
  } catch {
    return { token: tokens.access_token, handle, userId };
  }
}
