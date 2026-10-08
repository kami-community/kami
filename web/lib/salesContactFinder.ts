/**
 * Find a real public/role email on a company's own domain. Never invent addresses.
 * Pipeline: site scrape → Linkup evidence extract → Hermes extract-from-evidence only.
 */

import { completeOrNull, hermesConfigured } from "@/lib/hermes/client";
import { parseLastJsonBlock } from "@/lib/hermes/json";
import {
  isUndeliverable,
  type EmailVerification,
  type EmailVerifier,
} from "@/lib/ports/emailVerifier";
import { emailVerifier, searchProvider } from "@/lib/providers";
import type { FinderVerificationStatus } from "@/lib/domain/contacts";

/** Includes `founder_provided`: an address the founder typed in themselves (never agent-invented). */
export type EmailVerificationStatus = FinderVerificationStatus;

export interface FoundContact {
  email: string;
  name?: string;
  title?: string;
  verification_status: EmailVerificationStatus;
  source_url: string;
  method?: "site_scrape" | "web_search" | "hermes";
  /** True only for persona/buyer-shaped locals on a domain that accepts mail. */
  buyer_reachable?: boolean;
  /** Deliverability check of the address's domain (syntax + MX, A/AAAA fallback). */
  deliverability?: EmailVerification;
}

/** Shared/role inboxes — real but not sequence-eligible as a buyer. */
const ROLE_LOCAL =
  /^(hello|hi|sales|contact|info|support|team|outreach|partnerships|partners|business|demo|getstarted|hello\+|sales\+|press|privacy|hr|legal|webmaster|security|billing|careers|jobs|recruiting|dpo|compliance|abuse|admin|office|help|customerservice|customer\.?service|media|pr|communications|comms|taxagencies|accommodations|fi-support|platform-support|partner-marketing|supplyco)$/i;

/** Single-letter / hash-like / placeholder locals — never treat as buyers. */
const NON_BUYER_LOCAL = /^(e|h|last|first|first\.last|name|user|test|asdf|[0-9a-f]{8,})$/i;

/** Exported for evals — whether a found contact may enter sequences/send. */
export function isBuyerReachableContact(
  contact: Pick<FoundContact, "email" | "verification_status" | "deliverability">,
): boolean {
  // A domain with no mail server is never reachable, whatever the mailbox looks like.
  if (contact.verification_status === "undeliverable" || isUndeliverable(contact.deliverability)) {
    return false;
  }
  // The founder chose this address explicitly — trust it, even a shared inbox.
  if (contact.verification_status === "founder_provided") return true;
  const local = (contact.email.split("@")[0] ?? "").toLowerCase();
  if (ROLE_LOCAL.test(local) || NON_BUYER_LOCAL.test(local)) return false;
  if (
    contact.verification_status === "role_inbox" ||
    contact.verification_status === "non_buyer_inbox" ||
    contact.verification_status === "unverified"
  ) {
    return false;
  }
  return (
    contact.verification_status === "verified_public" ||
    contact.verification_status === "hermes_evidence" ||
    contact.verification_status === "valid"
  );
}

const EMAIL_RE = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;

function isPlausibleEmail(email: string, companyDomain: string): boolean {
  const lower = email.toLowerCase();
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.includes("example.com"))
    return false;
  if (lower.includes("sentry") || lower.includes("wixpress") || lower.includes("cloudflare"))
    return false;
  if (lower.includes("noreply") || lower.includes("no-reply")) return false;
  const host = lower.split("@")[1] ?? "";
  const base = companyDomain.replace(/^www\./, "").toLowerCase();
  return host === base || host.endsWith(`.${base}`) || base.endsWith(`.${host}`);
}

function classify(email: string, method?: FoundContact["method"]): EmailVerificationStatus {
  const local = email.split("@")[0] ?? "";
  if (NON_BUYER_LOCAL.test(local)) return "non_buyer_inbox";
  if (ROLE_LOCAL.test(local)) return "role_inbox";
  if (method === "hermes") return "hermes_evidence";
  return "verified_public";
}

async function fetchText(url: string, timeoutMs = 12_000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "KamiSalesBot/1.0 (+https://github.com/saranambiar/kami)",
        Accept: "text/html,text/plain",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text") && !ctype.includes("html") && !ctype.includes("json")) return null;
    const text = await res.text();
    return text.slice(0, 200_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractEmails(text: string, companyDomain: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi)) {
    const email = m[1].toLowerCase();
    if (isPlausibleEmail(email, companyDomain)) found.add(email);
  }
  for (const m of text.matchAll(EMAIL_RE)) {
    const email = m[1].toLowerCase();
    if (isPlausibleEmail(email, companyDomain)) found.add(email);
  }
  return [...found];
}

function localRank(email: string): number {
  const local = email.split("@")[0] ?? "";
  if (NON_BUYER_LOCAL.test(local)) return 2;
  if (ROLE_LOCAL.test(local)) return 1;
  return 0;
}

function pickBestEmail(emails: string[]): string | null {
  if (!emails.length) return null;
  const ranked = [...emails].sort((a, b) => localRank(a) - localRank(b));
  return ranked[0];
}

/**
 * Attach the deliverability check. An address whose domain cannot receive mail is
 * marked `undeliverable` and is never buyer-reachable; `unknown` (DNS hiccup) keeps
 * the found classification but is recorded so callers can re-check before sending.
 */
export async function withDeliverability(
  contact: FoundContact,
  verifier: EmailVerifier = emailVerifier(),
): Promise<FoundContact> {
  const deliverability = await verifier.verify(contact.email);
  const verification_status: EmailVerificationStatus = isUndeliverable(deliverability)
    ? "undeliverable"
    : contact.verification_status;
  const verified = { ...contact, verification_status, deliverability };
  return { ...verified, buyer_reachable: isBuyerReachableContact(verified) };
}

/**
 * Probe homepage + common contact paths for a public/role inbox on the company domain.
 */
export async function findPublicContact(
  domain: string,
  verifier: EmailVerifier = emailVerifier(),
): Promise<FoundContact | null> {
  const found = await scrapePublicContact(domain);
  return found ? withDeliverability(found, verifier) : null;
}

async function scrapePublicContact(domain: string): Promise<FoundContact | null> {
  const host = domain.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".")) return null;

  const paths = ["", "/contact", "/contact-us", "/about", "/about-us", "/company", "/team"];
  for (const path of paths) {
    const url = `https://${host}${path}`;
    const html = await fetchText(url);
    if (!html) continue;
    const emails = extractEmails(html, host);
    const email = pickBestEmail(emails);
    if (!email) continue;
    const verification_status = classify(email, "site_scrape");
    return {
      email,
      verification_status,
      source_url: url,
      name: undefined,
      title:
        verification_status === "role_inbox"
          ? "Role inbox"
          : verification_status === "non_buyer_inbox"
            ? "Non-buyer mailbox"
            : undefined,
      method: "site_scrape",
      buyer_reachable: isBuyerReachableContact({ email, verification_status }),
    };
  }

  return null;
}

/** Pull same-domain emails from Linkup — inlined into findContactForDomain. */

async function findContactViaHermes(
  domain: string,
  companyName: string | undefined,
  evidenceBlob: string,
  kamiSessionId?: string | null,
): Promise<FoundContact | null> {
  if (!hermesConfigured()) return null;
  const host = domain.toLowerCase().replace(/^www\./, "");

  const prompt = `You find PUBLIC contact emails for outbound sales. Never invent.

Company: ${companyName || host}
Domain: ${host}

Evidence (web snippets — only use emails that literally appear here, on @${host}):
---
${evidenceBlob.slice(0, 6000)}
---

Rules:
- Return ONLY an email whose domain is ${host} (or a clear subdomain).
- Prefer sales@ / hello@ / contact@ / partnerships@ if present.
- If no such email appears in the evidence, return null email.
- Do not guess firstname.lastname patterns.

Output ONLY a fenced json block:
\`\`\`json
{ "email": "someone@${host}" | null, "source_url": "https://...", "name": null, "title": null, "reason": "quoted from evidence" }
\`\`\``;

  const text = await completeOrNull({
    agent: "sales-researcher",
    kind: "contact_find",
    input: prompt,
    kamiSessionId,
    timeoutMs: 60_000,
    meta: { domain: host },
  });
  if (!text) return null;

  const parsed = parseLastJsonBlock(text) as Record<string, unknown> | null;
  if (!parsed) return null;
  const email = typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : "";
  if (!email || !isPlausibleEmail(email, host)) return null;

  const source_url =
    typeof parsed.source_url === "string" && parsed.source_url.startsWith("http")
      ? parsed.source_url
      : `https://${host}`;

  const verification_status = classify(email, "hermes");
  return {
    email,
    name: typeof parsed.name === "string" ? parsed.name : undefined,
    title: typeof parsed.title === "string" ? parsed.title : undefined,
    verification_status,
    source_url,
    method: "hermes",
    buyer_reachable: isBuyerReachableContact({ email, verification_status }),
  };
}

/**
 * Full contact lookup: scrape → Linkup extract → Hermes extract-from-evidence,
 * then a deliverability check of the address's domain. Never invents an address.
 */
export async function findContactForDomain(
  domain: string,
  companyName?: string,
  kamiSessionId?: string | null,
  verifier: EmailVerifier = emailVerifier(),
): Promise<FoundContact | null> {
  const found = await findCandidateContact(domain, companyName, kamiSessionId);
  return found ? withDeliverability(found, verifier) : null;
}

async function findCandidateContact(
  domain: string,
  companyName?: string,
  kamiSessionId?: string | null,
): Promise<FoundContact | null> {
  const host = domain.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".")) return null;

  const scraped = await scrapePublicContact(host);
  if (scraped) return scraped;

  // Gather search evidence even if no email in snippets — the agent may extract carefully
  let evidenceBlob = "";
  const search = searchProvider();
  if (search) {
    const name = companyName?.trim() || host.split(".")[0];
    const queries = [
      `site:${host} (contact OR email OR mailto OR sales OR hello)`,
      `"@${host}" (${name} OR contact OR sales)`,
      `${name} ${host} email OR contact`,
    ];
    const chunks: string[] = [];
    const emails = new Set<string>();
    let sourceHit = `https://${host}`;

    for (const q of queries) {
      const results = await search.search(q, { limit: 5 });
      for (const r of results) {
        const blob = `${r.title}\n${r.content}\n${r.url}`;
        chunks.push(blob.slice(0, 600));
        for (const e of extractEmails(blob, host)) {
          emails.add(e);
          if (r.url) sourceHit = r.url;
        }
      }
    }

    const searchEmail = pickBestEmail([...emails]);
    if (searchEmail) {
      const verification_status = classify(searchEmail, "web_search");
      return {
        email: searchEmail,
        verification_status,
        source_url: sourceHit,
        method: "web_search",
        title:
          verification_status === "role_inbox"
            ? "Role inbox"
            : verification_status === "non_buyer_inbox"
              ? "Non-buyer mailbox"
              : undefined,
        buyer_reachable: isBuyerReachableContact({ email: searchEmail, verification_status }),
      };
    }

    evidenceBlob = chunks.join("\n---\n");
  }

  if (evidenceBlob) {
    const hermesHit = await findContactViaHermes(host, companyName, evidenceBlob, kamiSessionId);
    if (hermesHit) return hermesHit;
  } else if (hermesConfigured()) {
    // Minimal evidence: homepage text only
    const html = await fetchText(`https://${host}`);
    if (html) {
      const hermesHit = await findContactViaHermes(
        host,
        companyName,
        `Homepage excerpt:\n${html.slice(0, 4000)}`,
        kamiSessionId,
      );
      if (hermesHit) return hermesHit;
    }
  }

  return null;
}
