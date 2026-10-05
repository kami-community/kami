/**
 * Contact email provenance as stored on `sales_contacts.email_verification`.
 * Pure data + helpers, safe in the browser. "Never invent emails": only
 * evidenced (agent-found on the company's own domain) or founder-entered
 * addresses may enter a sequence.
 */

export type StoredEmailVerification =
  | "valid"
  | "founder_provided"
  | "safe_to_send"
  | "role_inbox"
  | "non_buyer_inbox"
  | "catch_all"
  | "unknown"
  | "invalid";

/** Statuses a contact finder can report (see lib/salesContactFinder.ts). */
export type FinderVerificationStatus =
  | "verified_public"
  | "role_inbox"
  | "non_buyer_inbox"
  | "unverified"
  | "valid"
  | "hermes_evidence"
  | "founder_provided";

/** Verifications that may receive a sequence. Role/shared inboxes stay visible but are not eligible. */
export const SEQUENCE_ELIGIBLE_VERIFICATIONS: readonly StoredEmailVerification[] = [
  "valid",
  "founder_provided",
];

/**
 * Map what a finder reported to what we persist. Role and non-buyer inboxes
 * keep their label (never upgraded to valid); anything unproven is "unknown".
 */
export function storedVerification(
  status: FinderVerificationStatus | null | undefined,
): StoredEmailVerification {
  switch (status) {
    case "role_inbox":
      return "role_inbox";
    case "non_buyer_inbox":
      return "non_buyer_inbox";
    case "founder_provided":
      return "founder_provided";
    case "verified_public":
    case "hermes_evidence":
    case "valid":
      return "valid";
    default:
      return "unknown";
  }
}

export interface ContactLike {
  email?: string | null;
  email_verification?: string | null;
  do_not_contact?: boolean | null;
}

/** Whether a stored contact may be enrolled in an email sequence. */
export function isSequenceEligibleContact(contact: ContactLike): boolean {
  if (!contact.email || contact.do_not_contact) return false;
  return SEQUENCE_ELIGIBLE_VERIFICATIONS.includes(
    contact.email_verification as StoredEmailVerification,
  );
}

const VERIFICATION_LABELS: Partial<Record<StoredEmailVerification, string>> = {
  valid: "found on company site",
  founder_provided: "added by you",
  role_inbox: "shared inbox — not sequence-eligible",
  non_buyer_inbox: "not a buyer inbox — not sequence-eligible",
  unknown: "unverified — not sequence-eligible",
};

export function verificationLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return VERIFICATION_LABELS[value as StoredEmailVerification] ?? value.replace(/_/g, " ");
}
