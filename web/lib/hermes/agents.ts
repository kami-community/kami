import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Agent registry. Each product step runs one named Hermes agent whose role
 * prompt lives in `agents/<file>.md` (repo root) and is sent as the system
 * message; Hermes layers it on top of its own core prompt and toolset.
 * Skills listed here are synced into Hermes by `npm run sync:skills`.
 */
export const AGENTS = {
  "brand-analyst": { file: "brand-analyst.md", skills: ["business_rules"] },
  guide: { file: "guide.md", skills: ["planning", "business_rules"] },
  "sales-strategist": {
    file: "sales-strategist.md",
    skills: ["sales_strategy", "icp_segmentation", "business_rules"],
  },
  "sales-researcher": {
    file: "sales-researcher.md",
    skills: ["signal_research", "icp_account_tiering", "business_rules"],
  },
  "marketing-strategist": {
    file: "marketing-strategist.md",
    skills: [
      "x_distribution",
      "reddit_distribution",
      "linkedin_distribution",
      "hackernews_distribution",
      "producthunt_distribution",
      "discord_distribution",
      "business_rules",
    ],
  },
  "distribution-manager": {
    file: "distribution-manager.md",
    skills: [
      "viral_formats",
      "x_distribution",
      "reddit_distribution",
      "linkedin_distribution",
      "hackernews_distribution",
      "producthunt_distribution",
      "discord_distribution",
      "business_rules",
    ],
  },
  "marketing-researcher": {
    file: "marketing-researcher.md",
    skills: ["creator_outreach", "business_rules"],
  },
  outreach: {
    file: "outreach.md",
    skills: ["signal_cold_email", "email_sequence", "review_rubric", "business_rules"],
  },
  "sales-conversation-manager": {
    file: "sales-conversation-manager.md",
    skills: ["reply_triage", "suppression_and_consent", "business_rules"],
  },
  "dm-assistant": {
    file: "dm-assistant.md",
    skills: ["founder_voice", "x_cold_dm", "creator_outreach", "review_rubric", "business_rules"],
  },
} as const;

export type AgentName = keyof typeof AGENTS;

const cache = new Map<AgentName, string>();

function agentsDir(): string {
  return process.env.KAMI_AGENTS_DIR ?? join(process.cwd(), "..", "agents");
}

/** The system prompt for an agent: its role file plus the skills it should apply. */
export function agentSystemPrompt(name: AgentName): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const spec = AGENTS[name];
  const role = readFileSync(join(agentsDir(), spec.file), "utf8")
    .replace(/^---[\s\S]*?---\s*/, "") // strip frontmatter
    .trim();
  const prompt = `${role}\n\nApply these Hermes skills where relevant: ${spec.skills.join(", ")}.`;
  cache.set(name, prompt);
  return prompt;
}
