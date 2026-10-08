import { env } from "@/lib/config/env";
import type { Platform } from "./providers";

/**
 * Short-lived cookie carrying OAuth state between /login and /callback:
 * `state.sessionId[.verifier]`. HttpOnly, 10 minutes, scoped to the callback flow.
 */

const cookieName = (platform: Platform) => `kami_oauth_${platform}`;

export interface PendingOAuth {
  state: string;
  sessionId: string;
  verifier?: string;
}

export function pendingOAuthCookie(platform: Platform, pending: PendingOAuth): string {
  const value = [pending.state, pending.sessionId, pending.verifier ?? ""].join(".");
  return [
    `${cookieName(platform)}=${value}`,
    "Path=/api/auth",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
    ...(env().NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}

export function clearPendingOAuthCookie(platform: Platform): string {
  return `${cookieName(platform)}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readPendingOAuth(
  platform: Platform,
  cookieHeader: string | null,
): PendingOAuth | null {
  const match = (cookieHeader ?? "").match(
    new RegExp(`(?:^|;\\s*)${cookieName(platform)}=([^;]+)`),
  );
  if (!match) return null;
  const [state, sessionId, verifier] = match[1].split(".");
  if (!state || !sessionId) return null;
  return { state, sessionId, verifier: verifier || undefined };
}
