import { describe, expect, it } from "vitest";
import { adminCookieValue, decideAccess, isCrossSiteMutation, isLoopbackHost } from "./access";

const base = { authorization: null, adminCookie: null };

describe("isLoopbackHost", () => {
  it.each(["localhost:3000", "127.0.0.1", "[::1]:3000", "LOCALHOST"])("accepts %s", (h) => {
    expect(isLoopbackHost(h)).toBe(true);
  });
  it.each(["kami.example.com", "192.168.1.5:3000", "localhost.evil.com", null])(
    "rejects %s",
    (h) => {
      expect(isLoopbackHost(h)).toBe(false);
    },
  );
});

describe("decideAccess", () => {
  it("allows loopback when no admin token is configured", () => {
    expect(decideAccess({ ...base, host: "localhost:3000" })).toEqual({
      allowed: true,
      via: "loopback",
    });
  });

  it("refuses non-loopback hosts when no admin token is configured (DNS rebinding, LAN)", () => {
    expect(decideAccess({ ...base, host: "attacker.example" }).allowed).toBe(false);
  });

  it("requires the token once configured, even on loopback", () => {
    expect(decideAccess({ ...base, host: "localhost", adminToken: "s3cret" }).allowed).toBe(false);
  });

  it("accepts a bearer token or the derived cookie", () => {
    const adminToken = "s3cret";
    expect(
      decideAccess({ ...base, host: "x", adminToken, authorization: "Bearer s3cret" }),
    ).toEqual({ allowed: true, via: "bearer" });
    expect(
      decideAccess({ ...base, host: "x", adminToken, adminCookie: adminCookieValue(adminToken) }),
    ).toEqual({ allowed: true, via: "cookie" });
  });

  it("never accepts the raw token as a cookie value", () => {
    expect(
      decideAccess({ ...base, host: "x", adminToken: "s3cret", adminCookie: "s3cret" }).allowed,
    ).toBe(false);
  });

  it("accepts the cron secret as a bearer token", () => {
    expect(
      decideAccess({
        ...base,
        host: "x",
        adminToken: "a",
        cronSecret: "c",
        authorization: "Bearer c",
      }),
    ).toEqual({ allowed: true, via: "cron" });
  });
});

describe("isCrossSiteMutation", () => {
  const post = { method: "POST", host: "localhost:3000", secFetchSite: null };

  it("ignores safe methods", () => {
    expect(isCrossSiteMutation({ ...post, method: "GET", origin: "https://evil.example" })).toBe(
      false,
    );
  });
  it("blocks a POST from another origin", () => {
    expect(isCrossSiteMutation({ ...post, origin: "https://evil.example" })).toBe(true);
  });
  it("blocks sec-fetch-site cross-site", () => {
    expect(isCrossSiteMutation({ ...post, origin: null, secFetchSite: "cross-site" })).toBe(true);
  });
  it("blocks the opaque null origin", () => {
    expect(isCrossSiteMutation({ ...post, origin: "null" })).toBe(true);
  });
  it("allows same-origin and origin-less (curl) requests", () => {
    expect(isCrossSiteMutation({ ...post, origin: "http://localhost:3000" })).toBe(false);
    expect(isCrossSiteMutation({ ...post, origin: null })).toBe(false);
  });
});
