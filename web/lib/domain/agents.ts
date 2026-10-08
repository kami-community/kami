import type { AgentName } from "@/lib/hermes/agents";

/**
 * Human names and one-line roles for the Hermes agents in the registry
 * (lib/hermes/agents.ts). Browser-safe: shown in the Team area, the top-bar
 * activity indicator and inline agent waits.
 */

export interface AgentProfile {
  /** "Sales strategist" */
  label: string;
  /** one line: what this agent does for the founder */
  role: string;
}

export const AGENT_PROFILES = {
  "brand-analyst": {
    label: "Brand analyst",
    role: "Learns your company from its own site and writes the dossier you confirm.",
  },
  guide: {
    label: "Kami Guide",
    role: "Answers your questions and proposes the next step. It never acts on its own.",
  },
  "sales-strategist": {
    label: "Sales strategist",
    role: "Turns the dossier into customer segments and a plain-English sales plan.",
  },
  "sales-researcher": {
    label: "Sales researcher",
    role: "Finds and verifies target companies, contacts and dated buying signals.",
  },
  "marketing-strategist": {
    label: "Marketing strategist",
    role: "Picks one angle and the two or three channels worth your time.",
  },
  "distribution-manager": {
    label: "Distribution manager",
    role: "Plans distribution and drafts posts for each channel for you to review.",
  },
  "marketing-researcher": {
    label: "Marketing researcher",
    role: "Ranks the creators and X accounts discovery found for fit with your niche.",
  },
  outreach: {
    label: "Outreach writer",
    role: "Drafts short, signal-based email sequences that you approve before sending.",
  },
  "sales-conversation-manager": {
    label: "Reply manager",
    role: "Triages replies to your outreach and suggests a response for you to edit.",
  },
  "dm-assistant": {
    label: "DM assistant",
    role: "Suggests your next DM in your voice and flags when you need to decide.",
  },
} as const satisfies Record<AgentName, AgentProfile>;
