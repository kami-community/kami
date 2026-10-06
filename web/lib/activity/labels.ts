/**
 * Plain-language names for Hermes agents and the tasks (run `kind`s) they do,
 * so the founder reads "Sales strategist · Writing the sales plan" instead of
 * `sales-strategist · sales_plan`. Browser-safe and pure: used by the API and
 * by the top-bar indicator and Team area.
 */

import { AGENT_PROFILES, type AgentProfile } from "@/lib/domain/agents";

export type AgentLabel = AgentProfile;

/** Registry agents plus steps logged under other names (the discovery pipeline). */
export const AGENT_LABELS: Record<string, AgentLabel> = {
  ...AGENT_PROFILES,
  discovery: {
    label: "Discovery",
    role: "Searches the web for companies that match your segments.",
  },
};

/** Run kinds → what the agent is doing, as a present-tense task. */
export const KIND_LABELS: Record<string, string> = {
  research: "Researching your company",
  dossier_generate: "Writing your company dossier",
  dossier_revise: "Revising the dossier from your edits",
  ask_kami: "Answering your question",
  sales_segments: "Proposing customer segments",
  sales_plan: "Writing the sales plan",
  sales_discover: "Finding target companies",
  contact_find: "Finding the right contacts",
  sales_drafts: "Drafting outreach emails",
  reply_triage: "Triaging a reply",
  draft_rewrite: "Rewriting a passage",
  distribution_plan: "Planning distribution",
  distribution_research: "Researching distribution opportunities",
  distribution_opportunities: "Drafting distribution opportunities",
  marketing_rank: "Ranking creators and leads",
  dm_suggest: "Suggesting a DM reply",
};

function humanize(value: string): string {
  const t = value.replace(/[-_]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Agent";
}

/** "sales-strategist" → "Sales strategist"; unknown names are humanized. */
export function agentLabel(agent: string | null | undefined): string {
  if (!agent) return "Kami";
  return AGENT_LABELS[agent]?.label ?? humanize(agent);
}

/** "sales_plan" → "Writing the sales plan"; "sales_plan_retry" → "Writing the sales plan (correcting)". */
export function kindLabel(kind: string): string {
  const retry = kind.endsWith("_retry");
  const base = retry ? kind.slice(0, -"_retry".length) : kind;
  const label = KIND_LABELS[base] ?? humanize(base);
  return retry ? `${label} (correcting)` : label;
}

/** Run statuses that count as a failure: errors, timeouts and runs that never reported back. */
export function isFailedStatus(status: string): boolean {
  return status === "error" || status === "timeout" || status === "stale";
}
