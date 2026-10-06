/**
 * Agent runs in plain language for Home → Team activity:
 * "Outreach drafted emails", "Brand analyst researched your company".
 * Pure, so the wording is unit-tested.
 */

export interface RunSummary {
  id: string;
  kind: string;
  agent: string | null;
  status: string;
  created_at: string;
}

const AGENT_NAMES: Record<string, string> = {
  "brand-analyst": "Brand analyst",
  guide: "Kami Guide",
  "sales-strategist": "Sales strategist",
  "sales-researcher": "Sales researcher",
  "marketing-strategist": "Marketing strategist",
  "distribution-manager": "Distribution manager",
  "marketing-researcher": "Marketing researcher",
  outreach: "Outreach",
  "sales-conversation-manager": "Conversation manager",
  "dm-assistant": "DM assistant",
  discovery: "Sales researcher",
};

/** What a run of each kind did, in the past tense. */
const DID: Record<string, string> = {
  research: "researched your company",
  dossier_generate: "wrote your company profile",
  dossier_revise: "revised your company profile",
  ask_kami: "answered a question",
  sales_segments: "drafted buyer segments",
  sales_plan: "drafted an outreach plan",
  sales_discover: "found companies to contact",
  contact_find: "looked for a contact",
  sales_drafts: "drafted emails",
  draft_rewrite: "rewrote a passage",
  reply: "drafted a reply",
  reply_triage: "sorted a reply",
  escalation: "flagged a conversation for you",
  meeting: "prepared a meeting",
  distribution_plan: "proposed a distribution plan",
  distribution_research: "searched for conversations to join",
  distribution_opportunities: "drafted distribution opportunities",
  marketing_rank: "ranked creators",
  dm_suggest: "drafted a DM",
};

export function agentName(agent: string | null): string {
  if (!agent) return "Kami";
  return AGENT_NAMES[agent] ?? agent.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** "Outreach drafted emails", "Outreach is working now", "Outreach couldn't finish: drafted emails". */
export function describeRun(run: RunSummary): string {
  const kind = run.kind.replace(/_retry$/, "");
  const did = DID[kind] ?? `ran ${kind.replace(/_/g, " ")}`;
  const who = agentName(run.agent);
  if (run.status === "running") return `${who} is working now`;
  if (["error", "timeout", "failed", "stale"].includes(run.status))
    return `${who} couldn't finish: ${did}`;
  return `${who} ${did}`;
}
