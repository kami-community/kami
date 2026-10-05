import { describe, expect, it } from "vitest";
import { isBuyerReachableContact } from "@/lib/salesContactFinder";
import { isSequenceEligibleContact, storedVerification, verificationLabel } from "./contacts";

describe("storedVerification", () => {
  it("keeps role and non-buyer labels, maps evidence to valid, the rest to unknown", () => {
    expect(storedVerification("role_inbox")).toBe("role_inbox");
    expect(storedVerification("non_buyer_inbox")).toBe("non_buyer_inbox");
    expect(storedVerification("verified_public")).toBe("valid");
    expect(storedVerification("hermes_evidence")).toBe("valid");
    expect(storedVerification("founder_provided")).toBe("founder_provided");
    expect(storedVerification("unverified")).toBe("unknown");
    expect(storedVerification(undefined)).toBe("unknown");
  });
});

describe("isSequenceEligibleContact", () => {
  it("accepts evidenced and founder-provided emails", () => {
    expect(isSequenceEligibleContact({ email: "a@b.co", email_verification: "valid" })).toBe(true);
    expect(
      isSequenceEligibleContact({ email: "a@b.co", email_verification: "founder_provided" }),
    ).toBe(true);
  });

  it("rejects role inboxes, unknown provenance, missing email and do-not-contact", () => {
    expect(isSequenceEligibleContact({ email: "a@b.co", email_verification: "role_inbox" })).toBe(
      false,
    );
    expect(isSequenceEligibleContact({ email: "a@b.co", email_verification: null })).toBe(false);
    expect(isSequenceEligibleContact({ email: null, email_verification: "valid" })).toBe(false);
    expect(
      isSequenceEligibleContact({
        email: "a@b.co",
        email_verification: "valid",
        do_not_contact: true,
      }),
    ).toBe(false);
  });
});

describe("founder_provided reachability", () => {
  it("is buyer-reachable even for a shared inbox the founder chose", () => {
    expect(
      isBuyerReachableContact({ email: "sales@acme.com", verification_status: "founder_provided" }),
    ).toBe(true);
    expect(
      isBuyerReachableContact({ email: "sales@acme.com", verification_status: "verified_public" }),
    ).toBe(false);
  });
});

describe("verificationLabel", () => {
  it("explains why a contact is not eligible", () => {
    expect(verificationLabel("role_inbox")).toMatch(/not sequence-eligible/);
    expect(verificationLabel(null)).toBeNull();
  });
});
