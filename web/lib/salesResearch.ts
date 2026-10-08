import type { SalesSegment } from "@/lib/domain/segments";
import {
  findContactForDomain,
  isBuyerReachableContact,
  type FoundContact,
} from "./salesContactFinder";
import { searchProvider } from "@/lib/providers";

export interface ProvenanceRecord {
  provider: "linkup" | "exa" | "tavily" | "hermes" | "site_scrape";
  url: string;
  captured_at: string;
  confidence: number;
  evidence_text: string;
  signal_type: string;
}

export interface ResearchedSignal extends ProvenanceRecord {
  detail: string;
  observed_at?: string;
}

export interface LeadScoreResult {
  fit: number;
  intent: number;
  contactability: number;
  priority: number;
  explanation: string;
}

export interface ResearchedAccount {
  name: string;
  domain: string;
  industry?: string;
  geo?: string;
  tier: 1 | 2 | 3;
  segment_key?: string;
  score: LeadScoreResult;
  signals: ResearchedSignal[];
  notes?: string;
  contact?: FoundContact | null;
}

export interface ResearchFromSegmentsParams {
  offerDomain: string;
  segments: SalesSegment[];
  exclusions?: string[];
  kamiSessionId?: string | null;
}

export interface ResearchFromSegmentsResult {
  accounts: ResearchedAccount[];
  warnings: string[];
}

const FIT_FLOOR = 0.35;

/** Exported for evals — non-company hosts that must never become accounts. */
export const PUBLISHER_BLOCKLIST = [
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "crunchbase.com",
  "techcrunch.com",
  "bloomberg.com",
  "reuters.com",
  "wikipedia.org",
  "google.com",
  "github.com",
  "wellfound.com",
  "angel.co",
  "underdog.io",
  "gogloby.com",
  "medium.com",
  "substack.com",
  "forbes.com",
  "businessinsider.com",
  "producthunt.com",
  "glassdoor.com",
  "indeed.com",
  "builtin.com",
  "ycombinator.com",
  "news.ycombinator.com",
  "reddit.com",
  "quora.com",
  "notion.site",
  "notion.so",
  "wordpress.com",
  "blogspot.com",
  "ghost.io",
  "beehiiv.com",
  "axios.com",
  "theverge.com",
  "wired.com",
  "zdnet.com",
  "cnet.com",
  "g2.com",
  "capterra.com",
  "getapp.com",
  // shorteners
  "ow.ly",
  "ift.tt",
  "lnkd.in",
  "bit.ly",
  "buff.ly",
  "t.co",
  "tinyurl.com",
  "goo.gl",
  // job boards / aggregators / listicle hosts
  "ziprecruiter.com",
  "roya.com",
  "topstartups.io",
  "growthlist.co",
  "nearspacelabs.com",
  "appinventiv.com",
  "digisoftsolution.com",
  "profitable.app",
  "wellfound.com",
];

const LISTICLE_TITLE =
  /\b(best|top)\s+\d*\s*(saas|b2b|startup|companies|firms|agencies|platforms|tools)\b|\bto work for\b|\brecruiting firms\b|\bbest agencies\b|\blist of\b|\bcompanies like\b|\b\d+\s+(hot|funded|healthcare|saas|startup)\b|\bbusiness ideas?\b|\bnow hiring\b|\brevenue\s+20\d{2}\b|\bmrr,?\s*profit\b/i;

/** Exported for evals */
export function isDomainBlocked(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return PUBLISHER_BLOCKLIST.some((b) => h === b || h.endsWith(`.${b}`));
}

/** Exported for evals */
export function isListicleTitle(title: string): boolean {
  return LISTICLE_TITLE.test(title.trim());
}

/** Exported for evals — normalize + reject junk domains. */
export function normalizeCompanyDomain(raw: string): string | null {
  try {
    const withProto = raw.includes("://") ? raw : `https://${raw}`;
    const host = new URL(withProto).hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".") || isDomainBlocked(host)) return null;
    // Reject bare TLDs / shortener-like 2-label weirdness already covered
    if (host.split(".").length < 2) return null;
    return host;
  } catch {
    const cleaned = raw
      .trim()
      .toLowerCase()
      .replace(/^www\./, "");
    if (cleaned.includes(".") && !cleaned.includes(" ") && !isDomainBlocked(cleaned))
      return cleaned;
    return null;
  }
}

/**
 * Prefer company domains mentioned in page content over the publisher host.
 * Exported for evals (legacy Linkup path helpers kept for regression).
 */
export function extractCompanyDomainsFromContent(
  content: string,
  publisherHost: string,
  offerDomain?: string | null,
): string[] {
  const found = new Set<string>();
  const urlMatches = content.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?:[/\s"'<>)]|$)/gi);
  for (const m of urlMatches) {
    const host = m[1].toLowerCase().replace(/^www\./, "");
    if (host === publisherHost) continue;
    if (offerDomain && host === offerDomain) continue;
    if (isDomainBlocked(host)) continue;
    found.add(host);
  }
  const bareMatches = content.matchAll(
    /\b([a-z0-9][a-z0-9-]{1,40}\.(?:com|io|co|ai|dev|app|so|gg))\b/gi,
  );
  for (const m of bareMatches) {
    const host = m[1].toLowerCase();
    if (host === publisherHost) continue;
    if (offerDomain && host === offerDomain) continue;
    if (isDomainBlocked(host)) continue;
    found.add(host);
  }
  return [...found];
}

function companyNameFromDomain(domain: string): string {
  const base = domain.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function matchesExclusion(name: string, domain: string, exclusions: string[]): boolean {
  const hay = `${name} ${domain}`.toLowerCase();
  return exclusions.some((ex) => {
    const needle = ex.trim().toLowerCase();
    if (!needle) return false;
    return hay.includes(needle) || domain === normalizeCompanyDomain(needle);
  });
}

/** Intent decay: full ≤14d, moderate ≤60d, near-zero older / missing. Exported for evals. */
export function decayIntent(ageDays: number | null, baseConfidence = 0.8): number {
  if (ageDays == null || Number.isNaN(ageDays)) return Math.min(1, baseConfidence * 0.4);
  if (ageDays <= 14) return Math.min(1, baseConfidence);
  if (ageDays <= 60) return Math.min(1, baseConfidence * 0.55);
  return Math.min(1, baseConfidence * 0.15);
}

/**
 * Two-axis Fit × Intent scoring. Gate on fit floor; combine as product.
 * Exported for evals.
 */
export function scoreAccountAxes(params: {
  fit: number;
  intentRaw: number;
  hasVerifiedContact: boolean;
  signalAgeDays?: number | null;
}): LeadScoreResult {
  const fit = Math.max(0, Math.min(1, params.fit));
  const intent = decayIntent(params.signalAgeDays ?? null, params.intentRaw);
  // Buyer-reachable only elevates contactability; role/shared inboxes stay low.
  const contactability = params.hasVerifiedContact ? 0.85 : 0.25;

  if (fit < FIT_FLOOR) {
    return {
      fit,
      intent,
      contactability,
      priority: 0,
      explanation: `Fit ${(fit * 100).toFixed(0)}% below floor — deprioritized. Timing ${(intent * 100).toFixed(0)}%. ${params.hasVerifiedContact ? "Buyer-reachable contact found." : "No buyer-reachable contact yet."}`,
    };
  }

  // Product (not sum) so near-zero on either axis kills priority
  const priority = Math.min(1, fit * intent * (0.5 + contactability * 0.5));

  const explanation = [
    `Fit ${(fit * 100).toFixed(0)}% — segment / firmographic match`,
    `Timing ${(intent * 100).toFixed(0)}% — signal freshness (decays after 2 weeks)`,
    params.hasVerifiedContact
      ? `Reachable ${(contactability * 100).toFixed(0)}% — buyer-shaped verified email on company site`
      : `Reachable ${(contactability * 100).toFixed(0)}% — no buyer-reachable contact yet (role/shared inboxes do not count)`,
  ].join("; ");

  return { fit, intent, contactability, priority, explanation };
}

export function assignTierFromAxes(
  fit: number,
  intent: number,
  hasBuyerContact: boolean,
): 1 | 2 | 3 {
  // Tier 1 requires trigger-aligned intent AND a buyer-reachable contact — not any mailbox.
  if (fit >= 0.65 && intent >= 0.55 && hasBuyerContact) return 1;
  if (fit >= 0.5 && intent >= 0.35) return 2;
  return 3;
}

async function probeDomainAlive(domain: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`https://${domain}`, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "KamiSalesBot/1.0" },
    });
    // Many sites block HEAD — treat 405/403 as alive enough
    return res.ok || res.status === 405 || res.status === 403 || res.status === 401;
  } catch {
    try {
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), 8_000);
      try {
        const res = await fetch(`https://${domain}`, {
          method: "GET",
          signal: controller2.signal,
          redirect: "follow",
          headers: { "User-Agent": "KamiSalesBot/1.0", Accept: "text/html" },
        });
        return res.ok || res.status < 500;
      } finally {
        clearTimeout(timer2);
      }
    } catch {
      return false;
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Linkup signal search for a verified candidate — dated URL-backed only. */
export async function fetchSignalsForCandidate(params: {
  domain: string;
  companyName: string;
  trigger?: string;
  capturedAt: string;
}): Promise<ResearchedSignal[]> {
  const search = searchProvider();
  if (!search) return [];

  const trigger = (params.trigger ?? "").trim();
  const queries = [
    `site:${params.domain} ${trigger || "launch OR hiring OR funding OR product"}`.trim(),
    `"${params.companyName}" ${trigger || "funding OR hiring"}`.trim(),
  ].slice(0, 2);

  const out: ResearchedSignal[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    const results = await search.search(q, { limit: 3 });
    for (const r of results) {
      if (!r.url || !r.content) continue;
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      out.push({
        provider: search.id,
        url: r.url,
        captured_at: params.capturedAt,
        confidence: 0.7,
        evidence_text: r.content.slice(0, 400),
        signal_type: trigger ? "segment_trigger_hit" : "company_mention",
        detail: (r.title || r.content).slice(0, 240),
        observed_at: params.capturedAt,
      });
    }
  }

  return out.slice(0, 4);
}

function signalAgeDays(signals: ResearchedSignal[], capturedAt: string): number | null {
  const dated = signals.find((s) => s.observed_at || s.captured_at);
  if (!dated) return null;
  const t = Date.parse(dated.observed_at || dated.captured_at || capturedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / (1000 * 60 * 60 * 24));
}

/**
 * Segment-first discovery: verify named candidate companies, scrape real emails,
 * attach Linkup signals when available, score Fit×Intent (no signal → nurture/hold).
 */
export async function researchFromSegments(
  params: ResearchFromSegmentsParams,
): Promise<ResearchFromSegmentsResult> {
  const { offerDomain, segments, exclusions = [], kamiSessionId } = params;
  const offerHost = normalizeCompanyDomain(offerDomain);
  const capturedAt = new Date().toISOString();
  const warnings: string[] = [];
  const buckets = new Map<string, ResearchedAccount>();

  for (const segment of segments) {
    if (segment.motion === "plg_self_serve" && !segment.candidate_companies.length) {
      if (segment.example_user_personas.length) {
        warnings.push(
          `Segment "${segment.name}" is PLG/self-serve — personalize to individuals (e.g. ${segment.example_user_personas.map((p) => p.label).join("; ")}). No company blast list.`,
        );
      }
      continue;
    }

    let verifiedForSegment = 0;

    // Bound parallelism — sequential contact/Linkup was 90s+ for large seed lists.
    const candidates = segment.candidate_companies.filter((candidate) => {
      const domain = normalizeCompanyDomain(candidate.domain);
      if (!domain) return false;
      if (offerHost && domain === offerHost) return false;
      if (isDomainBlocked(domain)) return false;
      if (isListicleTitle(candidate.name)) return false;
      if (matchesExclusion(candidate.name, domain, exclusions)) return false;
      return true;
    });

    const CONCURRENCY = 3;
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (candidate) => {
          const domain = normalizeCompanyDomain(candidate.domain);
          if (!domain || buckets.has(domain)) return;

          const alive = await probeDomainAlive(domain);
          if (!alive) {
            warnings.push(`Could not verify ${candidate.name} (${domain}) — skipped`);
            return;
          }

          const contact = await findContactForDomain(
            domain,
            candidate.name || companyNameFromDomain(domain),
            kamiSessionId,
          );
          const hasAnyEmail = Boolean(contact?.email);
          const hasBuyerContact = Boolean(contact?.email && isBuyerReachableContact(contact));

          const searchSignals = await fetchSignalsForCandidate({
            domain,
            companyName: candidate.name || companyNameFromDomain(domain),
            trigger: segment.trigger_signal,
            capturedAt,
          });

          const signals: ResearchedSignal[] = [...searchSignals];
          if (!signals.length) {
            signals.push({
              provider: "site_scrape",
              url: `https://${domain}`,
              captured_at: capturedAt,
              confidence: 0.4,
              evidence_text: `Verified live site for ${domain}`,
              signal_type: "domain_alive",
              detail: "Homepage reachable — no dated buying signal found",
            });
          }

          const ageDays = signalAgeDays(searchSignals, capturedAt);
          const triggerTokens = (segment.trigger_signal || "")
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((t) => t.length >= 4);
          const hasTriggerAlignedSignal = searchSignals.some((s) => {
            const blob = `${s.evidence_text} ${s.detail} ${s.signal_type}`.toLowerCase();
            if (s.signal_type === "domain_alive") return false;
            if (!triggerTokens.length) return Boolean(s.url);
            return triggerTokens.some((t) => blob.includes(t));
          });
          const hasDatedSignal = searchSignals.length > 0;
          const fit = Math.min(1, 0.7 + (candidate.why ? 0.15 : 0) + (segment.why_fit ? 0.05 : 0));
          const intentRaw = hasTriggerAlignedSignal ? 0.75 : hasDatedSignal ? 0.4 : 0.25;
          const score = scoreAccountAxes({
            fit,
            intentRaw,
            hasVerifiedContact: hasBuyerContact,
            signalAgeDays: hasTriggerAlignedSignal ? (ageDays ?? 7) : null,
          });
          if (score.priority <= 0 && fit < FIT_FLOOR) return;

          if (!hasTriggerAlignedSignal) {
            warnings.push(
              `${candidate.name || domain}: no trigger-aligned buying signal — scored as nurture/hold, not Tier 1`,
            );
          }
          if (hasAnyEmail && !hasBuyerContact) {
            warnings.push(
              `${candidate.name || domain}: found ${contact!.email} but it is not buyer-reachable (${contact!.verification_status})`,
            );
          }

          const tier = assignTierFromAxes(score.fit, score.intent, hasBuyerContact);
          buckets.set(domain, {
            name: candidate.name || companyNameFromDomain(domain),
            domain,
            industry: segment.name,
            tier,
            segment_key: segment.key,
            score,
            signals,
            notes: candidate.why,
            contact: contact ?? null,
          });
          verifiedForSegment++;
        }),
      );
    }

    if (verifiedForSegment === 0 && segment.motion === "b2b_sales_assisted") {
      warnings.push(
        `Couldn't verify companies for segment "${segment.name}" — refine it or add real company domains.`,
      );
    }
  }

  const accounts = [...buckets.values()].sort((a, b) => b.score.priority - a.score.priority);
  return { accounts, warnings };
}

/** @deprecated Prefer researchFromSegments — kept name for older imports */
export async function researchSalesTargets(): Promise<never> {
  throw new Error(
    "researchSalesTargets is replaced by researchFromSegments — confirm ICP segments first",
  );
}
