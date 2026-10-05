import type { Dossier } from "@/lib/hermes";
import type { DomainIdentity } from "@/lib/domainIdentity";
import { sameRegistrableHost } from "@/lib/domainIdentity";

export interface DossierValidationResult {
  ok: boolean;
  dossier: Dossier | null;
  errors: string[];
}

/** Strong scheduling claims that must be grounded in site/research evidence. */
const SCHEDULING_CLAIM =
  /\b(calendly|chili\s*piper|scheduling infrastructure|booking link|book meetings)\b/i;
/** Broader tokens that ground those claims (JS-heavy sites often omit exact phrases). */
const SCHEDULING_GROUNDING =
  /\b(calendly|chili\s*piper|schedul|calendar|booking|book meetings|meeting link|appointment)\b/i;
const HEALTH_WORDS = /\b(biochem|biotech|pharma|telehealth|healthcare clinic|medical device)\b/i;

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Strict dossier validation against validated domain identity.
 * @param evidenceText optional research/facts markdown (and first-party excerpts) to ground vertical checks when the homepage extract is thin.
 */
export function validateDossier(
  raw: unknown,
  identity: DomainIdentity,
  evidenceText?: string | null,
): DossierValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, dossier: null, errors: ["Dossier JSON missing or invalid"] };
  }
  const o = raw as Record<string, unknown>;

  const company = asString(o.company);
  const brand_voice = asString(o.brand_voice);
  const positioning = asString(o.positioning);
  const canonical = asString(o.canonical_domain) || identity.canonical_domain;

  if (!company) errors.push("company required");
  if (!brand_voice) errors.push("brand_voice required");
  if (positioning.length < 20) errors.push("positioning too short or missing");

  if (canonical && !sameRegistrableHost(canonical, identity.canonical_domain)) {
    errors.push(
      `canonical_domain mismatch: dossier=${canonical} expected=${identity.canonical_domain}`,
    );
  }

  const buckets = Array.isArray(o.icp_buckets) ? o.icp_buckets : [];
  if (buckets.length < 2) errors.push("at least 2 icp_buckets required");

  const opportunities = Array.isArray(o.opportunities) ? o.opportunities : [];
  if (opportunities.length < 1) errors.push("at least 1 opportunity required");

  const competitors = Array.isArray(o.competitor_analysis) ? o.competitor_analysis : [];

  const evidenceUrls = Array.isArray(o.evidence_urls)
    ? (o.evidence_urls as unknown[]).filter((u): u is string => typeof u === "string")
    : [identity.evidence_url];

  const hasFirstParty = evidenceUrls.some((u) => {
    try {
      return sameRegistrableHost(new URL(u).hostname, identity.canonical_domain);
    } catch {
      return false;
    }
  });
  if (!hasFirstParty) errors.push("evidence_urls must include first-party domain URL");

  // Reject vertical hallucination vs first-party excerpt + research evidence
  const siteBlob = [
    identity.title ?? "",
    identity.description ?? "",
    identity.excerpt,
    identity.h1 ?? "",
    evidenceText ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const dossierBlob = `${positioning} ${company} ${asString(o.product_category)}`.toLowerCase();

  if (SCHEDULING_CLAIM.test(dossierBlob) && !SCHEDULING_GROUNDING.test(siteBlob)) {
    errors.push("dossier invents scheduling/booking narrative not present on the company site");
  }
  if (HEALTH_WORDS.test(dossierBlob) && !HEALTH_WORDS.test(siteBlob)) {
    errors.push("dossier invents healthcare/biotech narrative not present on the company site");
  }

  if (errors.length) {
    return { ok: false, dossier: null, errors };
  }

  const dossier: Dossier = {
    company,
    brand_voice,
    positioning,
    tone: Array.isArray(o.tone)
      ? (o.tone as string[]).filter((t) => typeof t === "string")
      : undefined,
    competitor_analysis: competitors
      .filter((c): c is { name: string; insight: string } => {
        return (
          !!c &&
          typeof c === "object" &&
          typeof (c as { name?: unknown }).name === "string" &&
          typeof (c as { insight?: unknown }).insight === "string"
        );
      })
      .map((c) => ({ name: c.name, insight: c.insight })),
    icp_buckets: buckets
      .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
      .map((b) => ({
        label: asString(b.label) || "Segment",
        where_they_live: asString(b.where_they_live),
        trigger_signal: asString(b.trigger_signal),
        est_size: asString(b.est_size),
        angle: asString(b.angle),
      })),
    opportunities: opportunities
      .filter((op): op is Record<string, unknown> => !!op && typeof op === "object")
      .map((op) => ({
        title: asString(op.title) || "Opportunity",
        playbook: asString(op.playbook) || "signal_cold_email",
        detail: asString(op.detail),
      })),
    canonical_domain: identity.canonical_domain,
    identity_confidence: identity.confidence,
    evidence_urls: evidenceUrls,
    product_category: asString(o.product_category) || undefined,
    industries: Array.isArray(o.industries)
      ? (o.industries as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    personas: Array.isArray(o.personas)
      ? (o.personas as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    geos: Array.isArray(o.geos)
      ? (o.geos as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
  };

  return { ok: true, dossier, errors: [] };
}
