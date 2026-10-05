import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Single-user access control for Community Edition.
 *
 * - No `KAMI_ADMIN_TOKEN`: only loopback hosts are served (local dev default).
 * - With `KAMI_ADMIN_TOKEN`: every request needs the admin cookie (set by /login)
 *   or `Authorization: Bearer <token>`.
 * - `KAMI_CRON_SECRET` lets schedulers call job routes with a bearer secret.
 *
 * Pure functions over plain inputs so the proxy and tests share one implementation.
 */

export const ADMIN_COOKIE = "kami_admin";
const COOKIE_CONTEXT = "kami-admin-session-v1";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function hostnameOf(hostHeader: string | null): string {
  if (!hostHeader) return "";
  const host = hostHeader.trim().toLowerCase();
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
  return host.split(":")[0];
}

export function isLoopbackHost(hostHeader: string | null): boolean {
  return LOOPBACK_HOSTS.has(hostnameOf(hostHeader));
}

/** Value stored in the admin cookie: an HMAC of the token, never the token itself. */
export function adminCookieValue(adminToken: string): string {
  return createHmac("sha256", adminToken).update(COOKIE_CONTEXT).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function bearer(authorization: string | null): string | null {
  const m = authorization?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export interface AccessInput {
  host: string | null;
  authorization: string | null;
  adminCookie: string | null;
  adminToken?: string;
  cronSecret?: string;
}

export type AccessDecision =
  | { allowed: true; via: "loopback" | "cookie" | "bearer" | "cron" }
  | { allowed: false; reason: string };

export function decideAccess(input: AccessInput): AccessDecision {
  const token = bearer(input.authorization);

  if (input.cronSecret && token && safeEqual(token, input.cronSecret)) {
    return { allowed: true, via: "cron" };
  }

  if (!input.adminToken) {
    return isLoopbackHost(input.host)
      ? { allowed: true, via: "loopback" }
      : {
          allowed: false,
          reason: "Kami only serves localhost unless KAMI_ADMIN_TOKEN is set",
        };
  }

  if (token && safeEqual(token, input.adminToken)) return { allowed: true, via: "bearer" };
  if (input.adminCookie && safeEqual(input.adminCookie, adminCookieValue(input.adminToken))) {
    return { allowed: true, via: "cookie" };
  }
  return { allowed: false, reason: "sign in required" };
}

export interface CsrfInput {
  method: string;
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
}

/** Block cross-site state-changing requests (browser CSRF against a local server). */
export function isCrossSiteMutation(input: CsrfInput): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(input.method.toUpperCase())) return false;
  if (input.secFetchSite === "cross-site") return true;
  if (!input.origin || input.origin === "null") return input.origin === "null";
  try {
    return new URL(input.origin).host.toLowerCase() !== (input.host ?? "").toLowerCase();
  } catch {
    return true;
  }
}
