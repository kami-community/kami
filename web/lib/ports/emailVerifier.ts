/**
 * Email deliverability check port. A verifier answers "can this address
 * receive mail at all?" — not "does this mailbox exist" (that needs SMTP probing
 * or a paid verifier, which a future adapter can provide behind this port).
 */

export type EmailVerificationStatus =
  /** Syntax is valid and the domain accepts mail (MX, or A/AAAA implicit MX per RFC 5321 §5.1). */
  | "deliverable_domain"
  /** The domain does not exist, publishes a null MX (RFC 7505), or has no MX/A/AAAA. */
  | "no_mail_server"
  /** Not a syntactically valid address. */
  | "invalid"
  /** DNS timed out or failed transiently — do not treat as bad, do not treat as verified. */
  | "unknown";

export interface EmailVerification {
  status: EmailVerificationStatus;
  /** ISO timestamp of the check. */
  checkedAt: string;
  /** Short machine-readable reason, e.g. "mx", "implicit_mx", "null_mx", "nxdomain", "timeout". */
  reason?: string;
}

export interface EmailVerifier {
  readonly id: string;
  verify(email: string): Promise<EmailVerification>;
}

/** True when the verification proves the address cannot receive mail. */
export function isUndeliverable(v: Pick<EmailVerification, "status"> | null | undefined): boolean {
  return v?.status === "no_mail_server" || v?.status === "invalid";
}
