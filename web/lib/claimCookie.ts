import { randomBytes } from "node:crypto";

export const CLAIM_COOKIE = "kami_claim";

/** Read kami_claim from Cookie header. */
export function readClaimId(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${CLAIM_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

export function newClaimId(): string {
  return randomBytes(16).toString("hex");
}

/** Set or refresh the claim cookie (HttpOnly). */
export function claimCookieHeader(claimId: string): string {
  return [
    `${CLAIM_COOKIE}=${claimId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000", // 30 days
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}
