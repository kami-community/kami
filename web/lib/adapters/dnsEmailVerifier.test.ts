import { describe, expect, it, vi } from "vitest";
import { createDnsEmailVerifier, emailDomain, type DnsResolver } from "./dnsEmailVerifier";

const NOW = new Date("2026-10-06T12:00:00.000Z");

function dnsError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function resolver(overrides: Partial<DnsResolver>): DnsResolver {
  return {
    resolveMx: vi.fn(async () => {
      throw dnsError("ENODATA");
    }),
    resolve4: vi.fn(async () => {
      throw dnsError("ENODATA");
    }),
    resolve6: vi.fn(async () => {
      throw dnsError("ENODATA");
    }),
    ...overrides,
  };
}

function verifier(r: DnsResolver, timeoutMs = 1_000) {
  return createDnsEmailVerifier({ resolver: r, timeoutMs, now: () => NOW });
}

describe("emailDomain (syntax)", () => {
  it.each([
    ["jane.doe@Acme.com", "acme.com"],
    ["first+tag@mail.acme.co.uk", "mail.acme.co.uk"],
  ])("accepts %s", (email, domain) => expect(emailDomain(email)).toBe(domain));

  it.each([
    "no-at-sign",
    "@acme.com",
    "jane@",
    "jane@localhost",
    "jane..doe@acme.com",
    "jane@-acme.com",
    "jane@acme.123",
    `${"a".repeat(65)}@acme.com`,
    "jane doe@acme.com",
  ])("rejects %s", (email) => expect(emailDomain(email)).toBeNull());
});

describe("createDnsEmailVerifier", () => {
  it("is invalid without touching DNS when the syntax is bad", async () => {
    const r = resolver({});
    expect(await verifier(r).verify("not an email")).toEqual({
      status: "invalid",
      reason: "syntax",
      checkedAt: NOW.toISOString(),
    });
    expect(r.resolveMx).not.toHaveBeenCalled();
  });

  it("is deliverable_domain when the domain has MX records", async () => {
    const r = resolver({
      resolveMx: vi.fn(async () => [{ exchange: "aspmx.l.google.com", priority: 1 }]),
    });
    expect(await verifier(r).verify("jane@acme.com")).toEqual({
      status: "deliverable_domain",
      reason: "mx",
      checkedAt: NOW.toISOString(),
    });
    expect(r.resolveMx).toHaveBeenCalledWith("acme.com");
    expect(r.resolve4).not.toHaveBeenCalled();
  });

  it("falls back to A/AAAA as an implicit MX (RFC 5321 §5.1)", async () => {
    const r = resolver({ resolve6: vi.fn(async () => ["2001:db8::1"]) });
    expect((await verifier(r).verify("jane@acme.com")).status).toBe("deliverable_domain");
    expect((await verifier(r).verify("jane@acme.com")).reason).toBe("implicit_mx");
  });

  it("is no_mail_server for a null MX (RFC 7505)", async () => {
    const r = resolver({ resolveMx: vi.fn(async () => [{ exchange: ".", priority: 0 }]) });
    expect(await verifier(r).verify("jane@parked.example")).toMatchObject({
      status: "no_mail_server",
      reason: "null_mx",
    });
  });

  it("is no_mail_server when the domain does not exist", async () => {
    const nx = async () => {
      throw dnsError("ENOTFOUND");
    };
    const r = resolver({ resolveMx: vi.fn(nx), resolve4: vi.fn(nx), resolve6: vi.fn(nx) });
    expect((await verifier(r).verify("jane@nope-nope.example")).status).toBe("no_mail_server");
  });

  it("is no_mail_server when there is no MX and no address", async () => {
    expect((await verifier(resolver({})).verify("jane@acme.com")).status).toBe("no_mail_server");
  });

  it("is unknown on transient DNS failures", async () => {
    const r = resolver({
      resolveMx: vi.fn(async () => {
        throw dnsError("ESERVFAIL");
      }),
    });
    expect(await verifier(r).verify("jane@acme.com")).toMatchObject({
      status: "unknown",
      reason: "ESERVFAIL",
    });
  });

  it("is unknown when DNS exceeds the timeout", async () => {
    const r = resolver({ resolveMx: vi.fn(() => new Promise<never>(() => {})) });
    expect(await verifier(r, 20).verify("jane@slow.example")).toMatchObject({
      status: "unknown",
      reason: "timeout",
    });
  });
});
