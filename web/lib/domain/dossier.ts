import { z } from "zod";

/**
 * The company dossier: what Kami believes about the founder's company,
 * compiled by the brand-analyst agent from first-party evidence and confirmed
 * by the founder ("That's us") before any GTM work starts.
 */

const text = (min = 1) => z.string().trim().min(min);
const list = z.array(z.string().trim().min(1)).default([]);

export const IcpBucketSchema = z.object({
  label: text(),
  where_they_live: z.string().trim().default(""),
  trigger_signal: z.string().trim().default(""),
  est_size: z.string().trim().default(""),
  angle: z.string().trim().default(""),
});

export const CompetitorSchema = z.object({
  name: text(),
  insight: text(),
});

export const DossierSchema = z.object({
  canonical_domain: text(),
  company: text(),
  brand_voice: text(),
  positioning: text(20),
  product_category: z.string().trim().optional(),
  tone: list,
  industries: list,
  personas: list,
  geos: list,
  competitor_analysis: z.array(CompetitorSchema).default([]),
  icp_buckets: z.array(IcpBucketSchema).min(2).max(6),
  evidence_urls: z.array(z.string().url()).min(1),
  identity_confidence: z.number().min(0).max(1).optional(),
});

export type IcpBucket = z.infer<typeof IcpBucketSchema>;
export type Competitor = z.infer<typeof CompetitorSchema>;
export type Dossier = z.infer<typeof DossierSchema>;
