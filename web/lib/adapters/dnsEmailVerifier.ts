import * as dns from "node:dns/promises";
import type { EmailVerification, EmailVerifier } from "@/lib/ports/emailVerifier";

/**
 * Built-in deliverability check: address syntax + the domain's mail servers.
 *
 * RFC 5321 §5.1: deliver to the MX hosts; if there are no MX records, the
 * domain's A/AAAA address is an implicit MX. RFC 7505: a single MX of "." (null
 * MX) means the domain accepts no mail. NXDOMAIN means the domain does not exist.
 */

export interface DnsResolver {
  resolveMx(hostname: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
}

export interface DnsEmailVerifierOptions {
  resolver?: DnsResolver;
  /** Per-domain budget for all lookups (default 4s). */
  timeoutMs?: number;
  now?: () => Date;
}

/** DNS answers that mean "this record type / name does not exist". */
const NOT_FOUND = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

const LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/** Lower-cased domain of a syntactically valid address (RFC 5321 length limits), else null. */
export function emailDomain(email: string): string | null {
  const value = email.trim();
  if (value.length > 254) return null;
  const at = value.lastIndexOf("@");
  if (at < 1) return null;
  const local = value.slice(0, at);
  const domain = value
    .slice(at + 1)
    .toLowerCase()
    .replace(/\.$/, "");
  if (local.length > 64 || !LOCAL_RE.test(local)) return null;
  if (!domain || domain.length > 253) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) return null;
  if (/^\d+$/.test(labels[labels.length - 1])) return null; // no numeric TLDs
  return domain;
}

function code(err: unknown): string {
  return (err as { code?: string } | null)?.code ?? "";
}

class Timeout extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Timeout(`DNS lookup exceeded ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Records of one type, [] when the name/type does not exist; rethrows other failures. */
async function records<T>(lookup: () => Promise<T[]>): Promise<T[]> {
  try {
    return await lookup();
  } catch (err) {
    if (NOT_FOUND.has(code(err))) return [];
    throw err;
  }
}

export function createDnsEmailVerifier(options: DnsEmailVerifierOptions = {}): EmailVerifier {
  const resolver: DnsResolver = options.resolver ?? dns;
  const timeoutMs = options.timeoutMs ?? 4_000;
  const now = options.now ?? (() => new Date());

  async function checkDomain(domain: string): Promise<Omit<EmailVerification, "checkedAt">> {
    try {
      const mx = await records(() => resolver.resolveMx(domain));
      const hosts = mx.map((r) => r.exchange.trim().replace(/\.$/, ""));
      if (hosts.length === 1 && hosts[0] === "") {
        return { status: "no_mail_server", reason: "null_mx" };
      }
      if (hosts.some((h) => h !== "")) return { status: "deliverable_domain", reason: "mx" };

      // No MX: fall back to the implicit MX (A/AAAA).
      const [a, aaaa] = await Promise.all([
        records(() => resolver.resolve4(domain)),
        records(() => resolver.resolve6(domain)),
      ]);
      if (a.length || aaaa.length) return { status: "deliverable_domain", reason: "implicit_mx" };
      return { status: "no_mail_server", reason: "no_mx_or_address" };
    } catch (err) {
      return { status: "unknown", reason: code(err) || "dns_error" };
    }
  }

  return {
    id: "dns",

    async verify(email) {
      const domain = emailDomain(email);
      if (!domain) return { status: "invalid", reason: "syntax", checkedAt: now().toISOString() };
      let result: Omit<EmailVerification, "checkedAt">;
      try {
        result = await withTimeout(checkDomain(domain), timeoutMs);
      } catch (err) {
        if (!(err instanceof Timeout)) throw err;
        result = { status: "unknown", reason: "timeout" };
      }
      return { ...result, checkedAt: now().toISOString() };
    },
  };
}
