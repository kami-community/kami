/**
 * Build distribution opportunities from dossier + goal.
 * Uses Hermes when available; otherwise returns honest scaffold opportunities
 * that require founder-supplied URLs for non-X platforms.
 */

import { capabilitiesPromptBlock, detectCapabilities } from "@/lib/capabilities";
import type {
  DistributionGoal,
  DistributionOpportunity,
  DistributionPlatform,
} from "@/lib/distributionTypes";
import type { Dossier } from "@/lib/hermes";
import { hermesChatOnce, hermesGatewayConfigured, parseLastJsonBlock } from "@/lib/hermesServer";

export type OpportunityDraft = Omit<
  DistributionOpportunity,
  "id" | "session_id" | "created_at" | "updated_at"
>;

function scaffoldOpportunities(
  goal: DistributionGoal,
  angle: string,
  dossier: Dossier | null,
  domain: string,
): OpportunityDraft[] {
  const company = dossier?.company || domain;
  const problem = dossier?.positioning?.slice(0, 160) || `what ${company} helps people do`;

  return [
    {
      campaign_id: null,
      platform: "x",
      source_url: "https://x.com/search?q=" + encodeURIComponent(problem.slice(0, 40)),
      evidence:
        "[source=scaffold] Refine with live X search or browser research — not a researched opportunity",
      why_now: `[FALLBACK] People discussing ${problem} are active; a founder-native take can create early attention.`,
      suggested_action:
        "Post a short insight or reply in a relevant thread; product mention only if natural.",
      draft: `Working on ${company}: ${angle}\n\nIf you're dealing with ${problem}, I'd love to hear what you've tried.`,
      risks:
        "Avoid hard sells. Prefer usefulness and specificity. This row is a manual scaffold, not Hermes research.",
      approval_status: "needs_review",
      action_status: "draft",
      outcome: "none",
      agent_skill: "x_distribution",
    },
    {
      campaign_id: null,
      platform: "reddit",
      source_url: "manual://paste-thread-url",
      evidence: "[source=scaffold] Manual mode — paste a real thread URL after you find one",
      why_now: `[FALLBACK] Reddit discussions about ${problem} reward value-first comments.`,
      suggested_action:
        "Answer the question helpfully; mention the product only if rules allow and it fits.",
      draft: `I've been deep in this problem while building ${company}. Here's what worked for us…`,
      risks:
        "Read subreddit rules. Never spam. Prefer communities the founder already participates in.",
      approval_status: "needs_review",
      action_status: "draft",
      outcome: "none",
      agent_skill: "reddit_distribution",
    },
    {
      campaign_id: null,
      platform: "linkedin",
      source_url: "https://www.linkedin.com/feed/",
      evidence: "[source=scaffold] Founder-post draft — publish manually; not a researched thread",
      why_now: "[FALLBACK] Founder-led posts outperform brand pages for early-stage credibility.",
      suggested_action: "Post as the founder; invite comments from people who've felt the pain.",
      draft: `${angle}\n\nBuilding ${company} taught me something specific about ${problem}.\n\nCurious: how are you solving this today?`,
      risks: "Keep it personal and specific. No engagement-bait templates.",
      approval_status: "needs_review",
      action_status: "draft",
      outcome: "none",
      agent_skill: "linkedin_distribution",
    },
  ];
}

export async function researchDistributionOpportunities(input: {
  sessionId: string;
  goal: DistributionGoal;
  angle: string;
  domain: string;
  dossier: Dossier | null;
  hermesSessionId?: string;
}): Promise<{ opportunities: OpportunityDraft[]; source: "hermes" | "scaffold"; note?: string }> {
  const caps = detectCapabilities();
  const scaffold = scaffoldOpportunities(input.goal, input.angle, input.dossier, input.domain);

  if (!hermesGatewayConfigured()) {
    return {
      opportunities: scaffold,
      source: "scaffold",
      note: "Hermes unavailable — showing starter opportunities. Connect Hermes or paste real thread URLs.",
    };
  }

  const prompt = [
    "You are Kami's marketing platform specialist.",
    capabilitiesPromptBlock(caps),
    `Company domain: ${input.domain}`,
    `Company: ${input.dossier?.company ?? input.domain}`,
    `Positioning: ${input.dossier?.positioning ?? "(unknown)"}`,
    `Goal: ${input.goal}`,
    `Campaign angle: ${input.angle}`,
    "Return ONLY a fenced json block containing a JSON array (max 5) of distribution opportunities.",
    "Each object MUST include keys:",
    "platform (x|reddit|hackernews|linkedin|producthunt|discord), source_url, evidence, why_now,",
    "suggested_action, draft, risks.",
    "Hard rules:",
    "- source_url must be a real public thread/post URL (https://...), not a search page or positioning restatement.",
    "- evidence must quote or paraphrase the specific thread title/snippet that makes this timely.",
    "- why_now must reference that same source (title, community, or quote) — never restate company positioning alone.",
    "- draft must be written as a reply/comment for that specific source, not a generic brand post.",
    "- If you cannot find a real URL, omit that opportunity rather than inventing one.",
    "Never invent that you posted or messaged anyone. Manual-first. Value-first. No spam.",
    "Output format:",
    "```json",
    '[{"platform":"reddit","source_url":"https://...","evidence":"...","why_now":"...","suggested_action":"...","draft":"...","risks":"..."}]',
    "```",
  ].join("\n");

  try {
    const text = await hermesChatOnce({
      content: prompt,
      sessionId: input.hermesSessionId ?? `kami-dist-${input.sessionId}`,
      kamiSessionId: input.sessionId,
      kind: "distribution_research",
      agent: "marketing_strategist",
      timeoutMs: 120_000,
      meta: { goal: input.goal, angle: input.angle },
    });
    if (!text) {
      return {
        opportunities: scaffold,
        source: "scaffold",
        note: "Hermes returned empty — showing starter opportunities.",
      };
    }
    const parsed = parseLastJsonBlock(text);
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { opportunities?: unknown })?.opportunities)
        ? (parsed as { opportunities: unknown[] }).opportunities
        : null;
    if (!arr?.length) {
      return {
        opportunities: scaffold,
        source: "scaffold",
        note: "Hermes returned no parseable opportunities.",
      };
    }

    const platforms: DistributionPlatform[] = [
      "x",
      "reddit",
      "hackernews",
      "linkedin",
      "producthunt",
      "discord",
    ];
    const opportunities: OpportunityDraft[] = [];
    for (const raw of arr.slice(0, 5)) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const platform = platforms.includes(o.platform as DistributionPlatform)
        ? (o.platform as DistributionPlatform)
        : "x";
      const source_url = typeof o.source_url === "string" ? o.source_url.trim() : "";
      const why_now = typeof o.why_now === "string" ? o.why_now : "";
      const suggested_action = typeof o.suggested_action === "string" ? o.suggested_action : "";
      const draft = typeof o.draft === "string" ? o.draft : "";
      const evidence = typeof o.evidence === "string" ? o.evidence : null;
      if (!why_now || !suggested_action || !draft) continue;
      // Drop invent/placeholder rows — better to fall back visibly than fake research.
      if (!source_url.startsWith("http") || /manual:\/\//i.test(source_url)) continue;
      if (/x\.com\/search|twitter\.com\/search|linkedin\.com\/feed\/?$/i.test(source_url)) continue;
      opportunities.push({
        campaign_id: null,
        platform,
        source_url,
        evidence,
        why_now,
        suggested_action,
        draft,
        risks: typeof o.risks === "string" ? o.risks : null,
        approval_status: "needs_review",
        action_status: "draft",
        outcome: "none",
        agent_skill: `${platform}_distribution`,
      });
    }
    if (!opportunities.length) {
      return {
        opportunities: scaffold,
        source: "scaffold",
        note: "Hermes output invalid — using starter queue.",
      };
    }
    return { opportunities, source: "hermes" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "hermes failed";
    return { opportunities: scaffold, source: "scaffold", note: msg };
  }
}
