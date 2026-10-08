import { describe, expect, it, vi } from "vitest";

// The default resolver is node:dns/promises — mocked here so no real DNS is queried.
vi.mock("node:dns/promises", () => ({
  resolveMx: vi.fn(async (host: string) => {
    if (host === "acme.com") return [{ exchange: "mx.acme.com", priority: 10 }];
    throw Object.assign(new Error("queryMx ENOTFOUND"), { code: "ENOTFOUND" });
  }),
  resolve4: vi.fn(async () => {
    throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
  }),
  resolve6: vi.fn(async () => {
    throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
  }),
}));

const { createDnsEmailVerifier } = await import("./dnsEmailVerifier");

describe("createDnsEmailVerifier with the default resolver", () => {
  it("uses node:dns/promises", async () => {
    const v = createDnsEmailVerifier();
    expect((await v.verify("jane@acme.com")).status).toBe("deliverable_domain");
    expect((await v.verify("jane@gone.example")).status).toBe("no_mail_server");
  });
});
