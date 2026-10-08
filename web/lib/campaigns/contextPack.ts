import type { Dossier } from "@/lib/domain/dossier";
import type { SalesCampaignConfig } from "@/lib/salesTypes";

const PLATFORM_BLURB = `Kami can: Find customers (Sales: research → draft emails → founder approves before send) · Create distribution (Marketing: opportunity queue with drafts; manual post first; CRM/cold DMs are Advanced). Never invent CRM numbers, contacts, or company facts not in this pack. Never claim you sent or published.`;

export interface ContextPackInput {
  dossier: Dossier | null;
  domain: string;
  salesConfig?: SalesCampaignConfig | null;
  /** Session goals (meetings, trials, awareness, fundraising, …). */
  goals?: string[] | null;
  /** Canonical validated host when different from display domain. */
  canonicalDomain?: string | null;
  /** Research provenance summary for the agent. */
  researchProvenance?: {
    sourceCount?: number;
    firstPartyCount?: number;
    confidence?: number;
    evidenceUrls?: string[];
  } | null;
  stage?: string | null;
  /** Current founder job on the UI. */
  activeJob?: "find_customers" | "create_distribution" | null;
  blockers?: string[] | null;
}

/** Compact company context (~1–2k tokens) given to every agent that reasons about the company. */
export function buildCompanyContextPack(input: ContextPackInput): string {
  const {
    dossier,
    domain,
    salesConfig,
    goals,
    canonicalDomain,
    researchProvenance,
    stage,
    activeJob,
    blockers,
  } = input;
  const host = (canonicalDomain || dossier?.canonical_domain || domain).replace(/^www\./, "");
  const company = dossier?.company?.trim() || host.replace(/^www\./, "").split(".")[0] || host;

  if (!dossier) {
    return [
      `COMPANY CONTEXT (incomplete)`,
      `Domain: ${host}`,
      `Company: ${company}`,
      `No dossier is available yet — research may still be running, or the user has not started a campaign.`,
      `If asked about positioning, ICPs, or opportunities: say clearly that company research is missing and they should wait for company research to finish (or start a campaign). Do not invent facts.`,
      "",
      `PLATFORM`,
      PLATFORM_BLURB,
    ].join("\n");
  }

  const lines: string[] = [
    `COMPANY CONTEXT`,
    `Canonical domain: ${host}`,
    `Company: ${dossier.company}`,
    `Positioning: ${dossier.positioning}`,
    `Brand voice: ${dossier.brand_voice}`,
  ];

  if (dossier.product_category) {
    lines.push(`Product category: ${dossier.product_category}`);
  }
  if (dossier.industries?.length) {
    lines.push(`Industries (evidence): ${dossier.industries.join(", ")}`);
  }
  if (dossier.personas?.length) {
    lines.push(`Personas (evidence): ${dossier.personas.join(", ")}`);
  }
  if (dossier.geos?.length) {
    lines.push(`Geos (evidence): ${dossier.geos.join(", ")}`);
  }
  if (typeof dossier.identity_confidence === "number") {
    lines.push(`Identity confidence: ${(dossier.identity_confidence * 100).toFixed(0)}%`);
  }
  if (dossier.evidence_urls?.length) {
    lines.push(`Evidence URLs: ${dossier.evidence_urls.slice(0, 6).join(", ")}`);
  }

  if (researchProvenance) {
    const bits = [
      researchProvenance.sourceCount != null ? `${researchProvenance.sourceCount} sources` : null,
      researchProvenance.firstPartyCount != null
        ? `${researchProvenance.firstPartyCount} first-party`
        : null,
      researchProvenance.confidence != null
        ? `conf ${(researchProvenance.confidence * 100).toFixed(0)}%`
        : null,
    ].filter(Boolean);
    if (bits.length) lines.push(`Research provenance: ${bits.join(" · ")}`);
  }

  if (goals?.length) {
    lines.push(`Client goals: ${goals.join("; ")}`);
  }
  if (stage) {
    lines.push(`Campaign stage: ${stage}`);
  }
  if (activeJob) {
    lines.push(
      `Active job: ${activeJob === "find_customers" ? "Find customers (Sales)" : "Create distribution (Marketing)"}`,
    );
  }
  if (blockers?.length) {
    lines.push(`Blockers: ${blockers.join("; ")}`);
  }

  if (dossier.tone?.length) {
    lines.push(`Tone: ${dossier.tone.join(", ")}`);
  }

  if (dossier.competitor_analysis?.length) {
    lines.push("Competitors:");
    for (const c of dossier.competitor_analysis.slice(0, 5)) {
      lines.push(`- ${c.name}: ${c.insight}`);
    }
  }

  if (dossier.icp_buckets?.length) {
    lines.push("ICP buckets:");
    for (const b of dossier.icp_buckets.slice(0, 5)) {
      lines.push(
        `- ${b.label} (${b.est_size}) — live: ${b.where_they_live}; trigger: ${b.trigger_signal}; angle: ${b.angle}`,
      );
    }
  }

  if (salesConfig) {
    const titles = salesConfig.icp?.titles?.join(", ") || "—";
    const industries = salesConfig.icp?.industries?.join(", ") || "—";
    lines.push(
      `Sales campaign (if set): offer="${(salesConfig.offer ?? "").slice(0, 160)}"; ICP titles=${titles}; industries=${industries}; geo=${salesConfig.geo ?? "—"}; target_qty=${salesConfig.target_quantity ?? "—"}`,
    );
    if (salesConfig.segments_confirmed_at && Array.isArray(salesConfig.segments)) {
      lines.push(
        `Confirmed segments: ${(salesConfig.segments as { name?: string }[])
          .map((s) => s.name)
          .filter(Boolean)
          .join("; ")}`,
      );
    }
  }

  lines.push(
    "",
    "IDENTITY LOCK",
    `- Analyze ONLY ${host}. Discard same-name entities on other domains.`,
    "- Use only facts in this pack; say when something is unknown.",
    "",
    "PLATFORM",
    PLATFORM_BLURB,
  );
  return lines.join("\n");
}
