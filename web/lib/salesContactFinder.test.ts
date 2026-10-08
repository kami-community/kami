import { describe, expect, it } from "vitest";
import type { EmailVerificationStatus, EmailVerifier } from "@/lib/ports/emailVerifier";
import {
  isBuyerReachableContact,
  withDeliverability,
  type FoundContact,
} from "./salesContactFinder";

function fixedVerifier(status: EmailVerificationStatus): EmailVerifier {
  return { id: "fixed", verify: async () => ({ status, checkedAt: "2026-10-06T00:00:00.000Z" }) };
}

const BUYER: FoundContact = {
  email: "jordan@acme.com",
  verification_status: "verified_public",
  source_url: "https://acme.com/team",
  method: "site_scrape",
  buyer_reachable: true,
};

describe("withDeliverability", () => {
  it("keeps a buyer on a domain that accepts mail reachable", async () => {
    const c = await withDeliverability(BUYER, fixedVerifier("deliverable_domain"));
    expect(c.buyer_reachable).toBe(true);
    expect(c.verification_status).toBe("verified_public");
    expect(c.deliverability?.status).toBe("deliverable_domain");
  });

  it("never treats an address whose domain has no mail server as buyer-reachable", async () => {
    const c = await withDeliverability(BUYER, fixedVerifier("no_mail_server"));
    expect(c.buyer_reachable).toBe(false);
    expect(c.verification_status).toBe("undeliverable");
    expect(isBuyerReachableContact(c)).toBe(false);
  });

  it("records an unknown DNS result without downgrading the contact", async () => {
    const c = await withDeliverability(BUYER, fixedVerifier("unknown"));
    expect(c.buyer_reachable).toBe(true);
    expect(c.deliverability?.status).toBe("unknown");
  });

  it("keeps role inboxes non-reachable regardless of DNS", async () => {
    const role = { ...BUYER, email: "sales@acme.com", verification_status: "role_inbox" as const };
    expect(
      (await withDeliverability(role, fixedVerifier("deliverable_domain"))).buyer_reachable,
    ).toBe(false);
  });
});
