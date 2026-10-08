import type { Dossier } from "@/lib/domain/dossier";
import type { SalesCampaignConfig, SalesIcp } from "@/lib/salesTypes";
import type { SalesSegment } from "@/lib/domain/segments";
import { icpFromSegments } from "@/lib/domain/segments";

export interface SalesNlPrefill {
  whoSentence: string;
  whatSentence: string;
  targetQty: number;
  icpTitles: string;
  icpIndustries: string;
  geo: string;
  offer: string;
  positioningLine: string;
}

/** First complete sentence, whole words, ~140 chars. Exported for evals. */
export function cleanPositioningLine(
  raw: string | null | undefined,
  fallbackCompany: string,
): string {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return `${fallbackCompany} — confirm positioning from Overview research.`;

  const sentenceMatch = text.match(/^(.+?[.!?])(\s|$)/);
  let line = sentenceMatch ? sentenceMatch[1].trim() : text;
  if (line.length <= 140) return line;

  const sliced = line.slice(0, 140);
  const lastSpace = sliced.lastIndexOf(" ");
  line = (lastSpace > 60 ? sliced.slice(0, lastSpace) : sliced).trim();
  return line.replace(/[,:;–—-]$/, "").trim();
}

function inferTitles(segments: SalesSegment[] | null | undefined, dossier: Dossier | null): string {
  if (segments?.length) {
    const t = icpFromSegments(segments).titles;
    if (t.length) return t.join(", ");
  }
  if (dossier?.personas?.length) return dossier.personas.slice(0, 3).join(", ");
  const labels = dossier?.icp_buckets?.map((b) => b.label).filter(Boolean) ?? [];
  return labels.slice(0, 3).join(", ");
}

function inferIndustries(
  segments: SalesSegment[] | null | undefined,
  dossier: Dossier | null,
): string {
  if (segments?.length) {
    const inds = icpFromSegments(segments).industries;
    if (inds.length) return inds.slice(0, 4).join(", ");
  }
  if (dossier?.industries?.length) return dossier.industries.slice(0, 4).join(", ");
  if (dossier?.product_category) return dossier.product_category;
  const fromBuckets = dossier?.icp_buckets?.map((b) => b.label).filter(Boolean) ?? [];
  return [...new Set(fromBuckets)].slice(0, 4).join(", ");
}

export function dossierToNlPrefill(
  dossier: Dossier | null,
  domain: string,
  segments?: SalesSegment[] | null,
  goals?: string[],
): SalesNlPrefill {
  const company = dossier?.company ?? domain.replace(/^www\./, "").split(".")[0];
  const positioningLine = cleanPositioningLine(dossier?.positioning, company);

  const whoSentence = segments?.length
    ? segments.map((s) => s.name).join("; ")
    : dossier?.icp_buckets?.length
      ? dossier.icp_buckets
          .slice(0, 3)
          .map((b) => `${b.label}${b.est_size ? ` (${b.est_size})` : ""}`)
          .join("; ")
      : `Decision-makers who would buy ${company}.`;

  const geo = dossier?.geos?.[0] ?? "";
  void goals; // callers use salesWhoLabel(goals) for UI; prefill stays evidence-driven

  return {
    whoSentence,
    whatSentence: positioningLine,
    targetQty: 15,
    icpTitles: inferTitles(segments, dossier),
    icpIndustries: inferIndustries(segments, dossier),
    geo,
    offer: positioningLine,
    positioningLine,
  };
}

export function nlPrefillToConfig(
  sessionId: string,
  prefill: SalesNlPrefill,
  advanced: {
    exclusions: string;
    dealMin: string;
    dealMax: string;
    dailyCap: number;
    senderName: string;
    senderEmail: string;
    autoFollowups: boolean;
    requireFirstSendApproval: boolean;
    channels: SalesCampaignConfig["allowed_channels"];
  },
): SalesCampaignConfig {
  const geo = prefill.geo?.trim() || undefined;
  const offer = (prefill.positioningLine || prefill.offer || prefill.whatSentence).slice(0, 280);
  const icp: SalesIcp = {
    titles: prefill.icpTitles
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    industries: prefill.icpIndustries
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    size: undefined,
    geo,
  };

  return {
    session_id: sessionId,
    offer,
    icp,
    geo,
    exclusions: advanced.exclusions
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    deal_range: {
      min: advanced.dealMin ? Number(advanced.dealMin) : undefined,
      max: advanced.dealMax ? Number(advanced.dealMax) : undefined,
      currency: "USD",
    },
    target_quantity: prefill.targetQty,
    daily_send_cap: advanced.dailyCap,
    allowed_channels: advanced.channels,
    sender_identity: advanced.senderName
      ? { name: advanced.senderName, email: advanced.senderEmail || undefined }
      : undefined,
    autonomy: {
      paused: false,
      auto_followups: advanced.autoFollowups,
      require_first_send_approval: advanced.requireFirstSendApproval,
    },
  };
}

export function configToNlPrefill(config: SalesCampaignConfig): SalesNlPrefill {
  const titles = config.icp?.titles?.join(", ") ?? "";
  const industries = config.icp?.industries?.join(", ") ?? "";
  const positioningLine = cleanPositioningLine(config.offer, "Your product");
  const whoSentence = titles
    ? `${titles}${config.icp?.size ? ` at ${config.icp.size} companies` : ""}${config.geo ? ` in ${config.geo}` : ""}.`
    : "Decision-makers that match our ICP.";

  return {
    whoSentence,
    whatSentence: positioningLine,
    targetQty: config.target_quantity ?? 15,
    icpTitles: titles,
    icpIndustries: industries,
    geo: config.geo ?? "",
    offer: positioningLine,
    positioningLine,
  };
}

/** Goal-aware SalesSetup question label. */
export function salesWhoLabel(goals?: string[] | null): string {
  const g = (goals ?? []).map((x) => x.toLowerCase());
  if (g.some((x) => x.includes("signup"))) return "Who should we invite to try the product?";
  if (g.some((x) => x.includes("awareness"))) return "Who should hear about this?";
  if (g.some((x) => x.includes("fund") || x.includes("raise")))
    return "Who should we reach for this round?";
  if (g.some((x) => x.includes("meeting") || x.includes("book")))
    return "Who should we try to book time with?";
  return "Who should we reach out to?";
}
