/**
 * Domain identity and research provenance: the verified ground truth every
 * agent works from. The identity is extracted from the founder's own site;
 * research sources are tagged first-party vs third-party.
 */

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

export interface ResearchSource {
  title: string;
  url: string;
  excerpt: string;
  source_class: "first_party" | "third_party_mention";
  query: string;
}

export interface ResearchSnapshot {
  canonical_domain: string;
  identity: DomainIdentity;
  sources: ResearchSource[];
  facts_markdown: string;
  created_at: string;
}

export type ResearchResult =
  { ok: true; snapshot: ResearchSnapshot } | { ok: false; reason: string };
