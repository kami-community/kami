import { createHash, randomBytes } from "node:crypto";
import { getMe } from "@/lib/adapters/x/api";
import { GRAPH, getProfile } from "@/lib/adapters/instagram";
import { env } from "@/lib/config/env";
import { upstreamFailed } from "@/lib/http/errors";

/**
 * OAuth configuration per platform. The connection service drives the shared
 * lifecycle (authorize → exchange → store sealed → refresh); each provider only
 * describes how its endpoints differ.
 */

export type Platform = "x" | "instagram";

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  /** Epoch milliseconds. */
  expires_at: number;
}

export interface AuthorizeRequest {
  url: string;
  state: string;
  /** PKCE verifier, when the provider uses PKCE. */
  verifier?: string;
}

export interface OAuthProvider {
  platform: Platform;
  configured(): boolean;
  authorize(): AuthorizeRequest;
  exchange(code: string, verifier?: string): Promise<TokenSet>;
  /** Refresh tokens this long before expiry. */
  refreshWindowMs: number;
  refresh(tokens: TokenSet): Promise<TokenSet>;
  profile(accessToken: string): Promise<{ id: string; handle: string }>;
}

function redirectUri(platform: Platform, configured: string | undefined): string {
  return configured ?? `${env().APP_URL}/api/auth/${platform}/callback`;
}

async function tokenResponse(res: Response, label: string): Promise<Record<string, unknown>> {
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    const reason = (json.error_message ??
      json.error_description ??
      json.error ??
      `HTTP ${res.status}`) as string;
    throw upstreamFailed(`${label} token request failed: ${String(reason).slice(0, 200)}`);
  }
  return json;
}

// --- X (OAuth 2.0 + PKCE) -------------------------------------------------------

const X_SCOPES = "tweet.read tweet.write users.read offline.access dm.read dm.write";

function xBasicAuth(): string {
  const { X_CLIENT_ID, X_CLIENT_SECRET } = env();
  return "Basic " + Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString("base64");
}

async function xTokenRequest(body: URLSearchParams): Promise<TokenSet> {
  const res = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: xBasicAuth() },
    body,
  });
  const json = await tokenResponse(res, "X");
  return {
    access_token: json.access_token as string,
    refresh_token: json.refresh_token as string | undefined,
    expires_at: Date.now() + Number(json.expires_in ?? 7200) * 1000,
  };
}

export const xProvider: OAuthProvider = {
  platform: "x",
  configured: () => Boolean(env().X_CLIENT_ID && env().X_CLIENT_SECRET),
  refreshWindowMs: 60_000,

  authorize() {
    const verifier = randomBytes(32).toString("base64url");
    const state = randomBytes(16).toString("hex");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: env().X_CLIENT_ID ?? "",
      redirect_uri: redirectUri("x", env().X_REDIRECT_URI),
      scope: X_SCOPES,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    return { url: `https://x.com/i/oauth2/authorize?${params}`, state, verifier };
  },

  exchange(code, verifier) {
    return xTokenRequest(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri("x", env().X_REDIRECT_URI),
        code_verifier: verifier ?? "",
        client_id: env().X_CLIENT_ID ?? "",
      }),
    );
  },

  async refresh(tokens) {
    if (!tokens.refresh_token)
      throw upstreamFailed("X token expired and cannot be refreshed — reconnect X");
    const fresh = await xTokenRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: env().X_CLIENT_ID ?? "",
      }),
    );
    return { ...fresh, refresh_token: fresh.refresh_token ?? tokens.refresh_token };
  },

  async profile(accessToken) {
    const me = await getMe(accessToken);
    return { id: me.id, handle: `@${me.username}` };
  },
};

// --- Instagram (Business Login) --------------------------------------------------

const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",");

export const instagramProvider: OAuthProvider = {
  platform: "instagram",
  configured: () => Boolean(env().INSTAGRAM_APP_ID && env().INSTAGRAM_APP_SECRET),
  // Long-lived tokens last ~60 days; refresh a week ahead.
  refreshWindowMs: 7 * 24 * 60 * 60 * 1000,

  authorize() {
    const state = randomBytes(16).toString("hex");
    const params = new URLSearchParams({
      client_id: env().INSTAGRAM_APP_ID ?? "",
      redirect_uri: redirectUri("instagram", env().INSTAGRAM_REDIRECT_URI),
      response_type: "code",
      scope: IG_SCOPES,
      state,
    });
    return { url: `https://www.instagram.com/oauth/authorize?${params}`, state };
  },

  async exchange(code) {
    const { INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI } = env();
    const res = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: INSTAGRAM_APP_ID ?? "",
        client_secret: INSTAGRAM_APP_SECRET ?? "",
        grant_type: "authorization_code",
        redirect_uri: redirectUri("instagram", INSTAGRAM_REDIRECT_URI),
        code: code.replace(/#_$/, ""),
      }),
    });
    const shortLived = await tokenResponse(res, "Instagram");

    // Short-lived (1h) → long-lived (~60 days)
    const llRes = await fetch(
      `${GRAPH}/access_token?${new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: INSTAGRAM_APP_SECRET ?? "",
        access_token: shortLived.access_token as string,
      })}`,
    );
    const longLived = await tokenResponse(llRes, "Instagram long-lived");
    return {
      access_token: longLived.access_token as string,
      expires_at: Date.now() + Number(longLived.expires_in ?? 5_184_000) * 1000,
    };
  },

  async refresh(tokens) {
    const res = await fetch(
      `${GRAPH}/refresh_access_token?${new URLSearchParams({
        grant_type: "ig_refresh_token",
        access_token: tokens.access_token,
      })}`,
    );
    const json = await tokenResponse(res, "Instagram refresh");
    return {
      access_token: json.access_token as string,
      expires_at: Date.now() + Number(json.expires_in ?? 5_184_000) * 1000,
    };
  },

  async profile(accessToken) {
    const p = await getProfile(accessToken);
    return { id: p.id, handle: `@${p.username}` };
  },
};

export const OAUTH_PROVIDERS: Record<Platform, OAuthProvider> = {
  x: xProvider,
  instagram: instagramProvider,
};
