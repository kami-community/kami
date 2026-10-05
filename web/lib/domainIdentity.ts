/**
 * Exact-domain identity: normalize, resolve, extract first-party evidence.
 * Never substitutes a search-result domain for the submitted domain.
 */

export type DomainInvalidReason =
  | "Domain not found"
  | "Website could not be reached"
  | "Domain redirected to another site"
  | "Website returned no usable content"
  | "Invalid domain";

export interface DomainIdentity {
  input: string;
  canonical_domain: string;
  final_url: string;
  company_name: string | null;
  title: string | null;
  description: string | null;
  h1: string | null;
  excerpt: string;
  evidence_url: string;
  confidence: number;
  validated_at: string;
}

export type DomainValidationResult =
  | { ok: true; identity: DomainIdentity }
  | { ok: false; reason: DomainInvalidReason; detail?: string };

const PRIVATE_HOSTS = /^(localhost|127\.|10\.|192\.168\.|0\.|\[::1\])/i;

/** Normalize user input to a bare hostname (no path/protocol). Exported for evals. */
export function normalizeDomainInput(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  let host: string;
  try {
    if (trimmed.includes("://")) {
      const u = new URL(trimmed);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      host = u.hostname;
    } else {
      host = trimmed.replace(/\/.*$/, "").replace(/:\d+$/, "");
    }
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  if (PRIVATE_HOSTS.test(host)) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    return null;
  }
  return host;
}

/** Registrable-ish comparison: foo.com == www.foo.com */
export function sameRegistrableHost(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/^www\./, "");
  const nb = b.toLowerCase().replace(/^www\./, "");
  return na === nb;
}

/** First label of a hostname (notion.so → notion). */
export function apexLabel(host: string): string {
  return (
    host
      .toLowerCase()
      .replace(/^www\./, "")
      .split(".")[0] ?? ""
  );
}

/**
 * Same-brand TLD move (notion.so → notion.com). Rejects unrelated redirects.
 * Requires apex label length ≥ 3 to avoid tiny ambiguous matches.
 */
export function isSameBrandHost(a: string, b: string): boolean {
  if (sameRegistrableHost(a, b)) return true;
  const la = apexLabel(a);
  const lb = apexLabel(b);
  return la.length >= 3 && la === lb;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, name: string): string | null {
  // Prefer double-quoted content (allows apostrophes like "It's 100% free")
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content="([^"]*)"`, "i"),
    new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:name|property)=["']${name}["']`, "i"),
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content='([^']*)'`, "i"),
    new RegExp(`<meta[^>]+content='([^']*)'[^>]+(?:name|property)=["']${name}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re)?.[1];
    if (m?.trim()) return m.trim();
  }
  return null;
}

function extractIdentityFromHtml(
  html: string,
  canonicalDomain: string,
  finalUrl: string,
): DomainIdentity {
  const title =
    html
      .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? null;
  const description = metaContent(html, "description") ?? metaContent(html, "og:description");
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ? stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)![1]).slice(0, 200)
    : null;

  let orgName: string | null = null;
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        const t = String((n as { "@type"?: string })["@type"] ?? "");
        if (/Organization|Corporation|LocalBusiness|SoftwareApplication/i.test(t)) {
          const name = (n as { name?: string }).name;
          if (typeof name === "string" && name.trim()) {
            orgName = name.trim();
            break;
          }
        }
      }
    } catch {
      /* ignore bad json-ld */
    }
    if (orgName) break;
  }

  // JS shells (Duolingo, etc.) often have almost no body text — prefer meta cards.
  const twitterDesc = metaContent(html, "twitter:description");
  const ogTitle = metaContent(html, "og:title");
  const twitterTitle = metaContent(html, "twitter:title");
  let excerpt = stripTags(html).slice(0, 1200);
  if (excerpt.length < 80) {
    const metaBlob = [title, ogTitle, twitterTitle, description, twitterDesc]
      .filter((s): s is string => Boolean(s && s.trim()))
      .join(" — ");
    if (metaBlob.length > excerpt.length) excerpt = metaBlob.slice(0, 1200);
  }
  const companyGuess =
    orgName || (title ? title.split(/[|\-–—]/)[0].trim() : null) || canonicalDomain.split(".")[0];

  const confidence = Math.min(
    1,
    0.35 +
      (title ? 0.2 : 0) +
      (description || twitterDesc ? 0.15 : 0) +
      (h1 ? 0.1 : 0) +
      (orgName ? 0.15 : 0) +
      (excerpt.length > 200 ? 0.1 : 0),
  );

  return {
    input: canonicalDomain,
    canonical_domain: canonicalDomain,
    final_url: finalUrl,
    company_name: companyGuess,
    title: title || ogTitle || twitterTitle,
    description: description || twitterDesc,
    h1,
    excerpt,
    evidence_url: finalUrl,
    confidence,
    validated_at: new Date().toISOString(),
  };
}

async function fetchHtml(
  url: string,
  timeoutMs = 12_000,
): Promise<{ ok: boolean; status: number; url: string; html: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "KamiDomainBot/1.0 (+https://github.com/saranambiar/kami)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const finalUrl = res.url || url;
    if (!res.ok) return { ok: false, status: res.status, url: finalUrl, html: null };
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text") && !ctype.includes("html") && !ctype.includes("xml")) {
      return { ok: false, status: res.status, url: finalUrl, html: null };
    }
    const html = (await res.text()).slice(0, 400_000);
    return { ok: true, status: res.status, url: finalUrl, html };
  } catch {
    return { ok: false, status: 0, url, html: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validate and extract first-party identity for the exact submitted domain.
 */
export async function validateDomainIdentity(raw: string): Promise<DomainValidationResult> {
  const canonical = normalizeDomainInput(raw);
  if (!canonical) {
    return { ok: false, reason: "Invalid domain" };
  }

  const candidates = [`https://${canonical}`, `https://www.${canonical}`];
  let lastFail: DomainInvalidReason = "Website could not be reached";

  for (const startUrl of candidates) {
    const fetched = await fetchHtml(startUrl);
    if (!fetched.ok || !fetched.html) {
      if (fetched.status === 0) lastFail = "Domain not found";
      else lastFail = "Website could not be reached";
      continue;
    }

    let finalHost: string;
    try {
      finalHost = new URL(fetched.url).hostname.replace(/^www\./, "");
    } catch {
      lastFail = "Website could not be reached";
      continue;
    }

    if (!isSameBrandHost(finalHost, canonical)) {
      return {
        ok: false,
        reason: "Domain redirected to another site",
        detail: `Redirected to ${finalHost}`,
      };
    }

    // Prefer the live host when the brand moved TLDs (e.g. notion.so → notion.com)
    const evidenceHost = sameRegistrableHost(finalHost, canonical) ? canonical : finalHost;
    const identity = extractIdentityFromHtml(fetched.html, evidenceHost, fetched.url);
    if (!identity.excerpt || identity.excerpt.length < 40) {
      lastFail = "Website returned no usable content";
      continue;
    }

    return { ok: true, identity };
  }

  return { ok: false, reason: lastFail };
}

/** Format identity for Hermes prompts. */
export function formatIdentityBlock(identity: DomainIdentity): string {
  return [
    `Canonical domain: ${identity.canonical_domain}`,
    `Final URL: ${identity.final_url}`,
    `Company name (from site): ${identity.company_name ?? "(unknown)"}`,
    `Title: ${identity.title ?? "(none)"}`,
    `Description: ${identity.description ?? "(none)"}`,
    `H1: ${identity.h1 ?? "(none)"}`,
    `Confidence: ${identity.confidence.toFixed(2)}`,
    `Evidence URL: ${identity.evidence_url}`,
    `Homepage excerpt: ${identity.excerpt.slice(0, 800)}`,
  ].join("\n");
}
