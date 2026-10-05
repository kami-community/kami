/**
 * Hermes Distribution Manager — recommends plan + researches via delegate_task.
 * Web app only gates approve/persist/publish; strategy and research live in Hermes.
 */

import { capabilitiesPromptBlock, detectCapabilities } from "@/lib/capabilities";
import type {
  DistributionOpportunity,
  DistributionPlan,
  DistributionPlatform,
  DistributionPlanSource,
} from "@/lib/distributionTypes";
import { DISTRIBUTION_PLATFORMS, normalizeSurfaces } from "@/lib/distributionTypes";
import type { Dossier } from "@/lib/domain/dossier";
import { completeOrNull, hermesConfigured, hermesSessionIdFor } from "@/lib/hermes/client";
import { parseLastJsonBlock } from "@/lib/hermes/json";

export type OpportunityDraft = Omit<
  DistributionOpportunity,
  "id" | "session_id" | "created_at" | "updated_at"
>;

export interface RecommendPlanResult {
  plan: Omit<DistributionPlan, "id" | "created_at" | "updated_at" | "session_id">;
  source: DistributionPlanSource;
  note?: string;
}

export interface ResearchResult {
  opportunities: OpportunityDraft[];
  source: "hermes" | "scaffold";
  note?: string;
}

/** The manager keeps one Hermes session per campaign so research builds on the approved plan. */
function managerSessionId(kamiSessionId: string): string {
  return hermesSessionIdFor({
    agent: "distribution-manager",
    kamiSessionId,
    continuity: "campaign",
  });
}

function planSurfaces(plan: DistributionPlan): DistributionPlatform[] {
  const surfaces = normalizeSurfaces(plan.surfaces).slice(0, 3);
  return surfaces.length ? surfaces : ["x", "reddit", "linkedin"];
}

/** First sentence of the positioning, cut at a word boundary, without trailing punctuation. */
function topicOf(positioning: string | undefined): string {
  const sentence = (positioning ?? "").trim().split(/(?<=[.!?])\s/)[0] ?? "";
  const clipped = sentence.length > 120 ? sentence.slice(0, 120).replace(/\s+\S*$/, "") : sentence;
  return clipped.replace(/[\s.;,:!?]+$/, "");
}

function fallbackPlan(
  domain: string,
  dossier: Dossier | null,
  reviseNote?: string,
): RecommendPlanResult["plan"] {
  const company = dossier?.company || domain;
  const positioning = topicOf(dossier?.positioning) || `what ${company} helps people do`;
  return {
    goal: "early_users",
    goal_label: "Find conversations where people need this product",
    angle: reviseNote?.trim()
      ? `Revised direction: ${reviseNote.trim().slice(0, 200)}. Lead with a useful take on ${positioning}.`
      : `Join conversations about ${positioning}; answer usefully before any product mention.`,
    surfaces: ["x", "reddit", "linkedin"],
    rationale: "Starter plan from your dossier — confirm or edit it before researching.",
    why_these_surfaces:
      "X and Reddit for live conversations; LinkedIn for a founder-native credibility post.",
    status: "proposed",
    source: "fallback",
    revise_note: reviseNote?.trim() || undefined,
  };
}

function parsePlanJson(
  raw: unknown,
  reviseNote?: string,
): Omit<DistributionPlan, "id" | "created_at" | "updated_at" | "session_id"> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const goal = typeof o.goal === "string" && o.goal.trim() ? o.goal.trim() : "";
  const angle = typeof o.angle === "string" && o.angle.trim() ? o.angle.trim() : "";
  if (!goal || !angle) return null;
  const surfaces = normalizeSurfaces(o.surfaces).slice(0, 3);
  if (!surfaces.length) return null;
  return {
    goal,
    goal_label:
      typeof o.goal_label === "string" && o.goal_label.trim()
        ? o.goal_label.trim()
        : goal.replace(/_/g, " "),
    angle,
    surfaces,
    rationale: typeof o.rationale === "string" ? o.rationale.trim() : "",
    why_these_surfaces: typeof o.why_these_surfaces === "string" ? o.why_these_surfaces.trim() : "",
    status: "proposed",
    source: "hermes",
    revise_note: reviseNote?.trim() || undefined,
  };
}

async function recommendPrompt(input: {
  domain: string;
  dossier: Dossier | null;
  reviseNote?: string;
}): Promise<string> {
  const caps = await detectCapabilities();
  const lines = [
    "You are Kami's Distribution Manager (see agents/distribution-manager.md Mode A).",
    "Recommend ONE distribution plan from the dossier. Do not ask the founder to pick from a chip list.",
    capabilitiesPromptBlock(caps),
    `Company domain: ${input.domain}`,
    `Company: ${input.dossier?.company ?? input.domain}`,
    `Positioning: ${input.dossier?.positioning ?? "(unknown)"}`,
    `ICP buckets: ${JSON.stringify(input.dossier?.icp_buckets ?? [])}`,
    `Personas: ${JSON.stringify(input.dossier?.personas ?? [])}`,
    `Industries: ${JSON.stringify(input.dossier?.industries ?? [])}`,
    `Tone: ${JSON.stringify(input.dossier?.tone ?? [])}`,
  ];
  if (input.reviseNote?.trim()) {
    lines.push(`Founder revise note (honor this): ${input.reviseNote.trim()}`);
  }
  lines.push(
    "Return ONLY a fenced json block:",
    "```json",
    JSON.stringify(
      {
        goal: "early_users",
        goal_label: "plain English job",
        angle: "specific hook for THIS product",
        surfaces: ["x", "reddit", "linkedin"],
        rationale: "why this goal/angle now",
        why_these_surfaces: "why these 2-3 platforms",
      },
      null,
      2,
    ),
    "```",
    "Hard rules: 2–3 surfaces max; different dossiers → different plans; never invent that you posted.",
  );
  return lines.join("\n");
}

async function researchPrompt(input: {
  domain: string;
  dossier: Dossier | null;
  plan: DistributionPlan;
}): Promise<string> {
  const caps = await detectCapabilities();
  const surfaces = planSurfaces(input.plan);
  const tasksHint = surfaces.map((platform) => ({
    goal: `Research 1 evidence-backed ${platform} opportunity for ${input.domain} using viral_formats + ${platform}_distribution`,
    context: {
      assigned_to: "distribution_platform_specialist",
      playbook: `${platform}_distribution`,
      also_follow: "viral_formats",
      platform,
      angle: input.plan.angle,
      goal: input.plan.goal,
      company: input.dossier?.company ?? input.domain,
      positioning: input.dossier?.positioning ?? "",
      acceptance_criteria: [
        "ONLY this platform — do not invent other surfaces",
        "Follow viral_formats: research current formats, pick ONE, draft to it",
        "Prefer https source_url to a specific thread/post",
        "If no real URL: return ONE row with source_url manual://paste-… and evidence starting with [needs_url]",
        "Include format_used and format_why",
        "No search pages, no feed home, no invented https URLs",
      ],
      output_schema: [
        "platform",
        "source_url",
        "evidence",
        "why_now",
        "suggested_action",
        "draft",
        "risks",
        "format_used",
        "format_why",
      ],
    },
  }));

  return [
    "You are Kami's Distribution Manager (see agents/distribution-manager.md Mode B).",
    "The founder APPROVED this distribution plan. Research opportunities by DELEGATING to platform specialists.",
    capabilitiesPromptBlock(caps),
    `Company domain: ${input.domain}`,
    `Company: ${input.dossier?.company ?? input.domain}`,
    `Positioning: ${input.dossier?.positioning ?? "(unknown)"}`,
    `Approved plan JSON: ${JSON.stringify({
      goal: input.plan.goal,
      goal_label: input.plan.goal_label,
      angle: input.plan.angle,
      surfaces,
      rationale: input.plan.rationale,
      why_these_surfaces: input.plan.why_these_surfaces,
    })}`,
    "",
    `HARD SURFACE RULE: return opportunities ONLY for these platforms: ${surfaces.join(", ")}.`,
    "Do NOT add LinkedIn, Product Hunt, or any other surface not in that list.",
    "",
    "REQUIRED procedure:",
    "1. Emit one WorkOrder per approved surface (max 3).",
    "2. Call Hermes delegate_task ONCE with a tasks array (parallel leaf specialists). Suggested tasks payload:",
    "```json",
    JSON.stringify(tasksHint, null, 2),
    "```",
    "3. Each leaf must follow `{platform}_distribution` AND `viral_formats` (skills/gtm/).",
    "4. Pass FULL context in each task — leaves have no parent history.",
    "5. Synthesize leaf results. Prefer real https URLs; if a leaf cannot ground, keep its [needs_url] manual:// row for that surface.",
    "6. Return ONLY a fenced json array (max 1 per surface, max 5 total). Prefer surface-correct rows over empty [].",
    "",
    "Opportunity object keys: platform, source_url, evidence, why_now, suggested_action, draft, risks, format_used, format_why.",
    "Hard rules: never invent https URLs; never claim you posted; manual-first; value-first; match a current viral format.",
  ].join("\n");
}

export const SCAFFOLD_SKILL = "scaffold";

function scaffoldCard(
  platform: DistributionPlatform,
  angle: string,
  company: string,
  problem: string,
): OpportunityDraft {
  const base = {
    campaign_id: null as string | null,
    approval_status: "needs_review" as const,
    action_status: "draft" as const,
    outcome: "none" as const,
    /** Marks a template row: not researched, shown behind a toggle in the UI. */
    agent_skill: SCAFFOLD_SKILL,
    format_used: "[scaffold] pending live format research",
    format_why: "Starter row — Hermes will pick a current format on a successful research run.",
  };

  switch (platform) {
    case "x":
      return {
        ...base,
        platform,
        source_url: "manual://paste-x-thread-or-post-url",
        evidence:
          "[needs_url][source=scaffold] Paste a real X thread/post URL — not Hermes research",
        why_now: `[FALLBACK] People discussing ${problem} are active on X; a founder-native take can create early attention.`,
        suggested_action:
          "Find a timely thread, paste the URL, then post a short insight in a current X format.",
        draft: `Working on ${company}: ${angle}\n\nIf you're dealing with ${problem}, I'd love to hear what you've tried.`,
        risks:
          "Avoid hard sells. Prefer usefulness and specificity. This row is a manual scaffold, not Hermes research.",
      };
    case "reddit":
      return {
        ...base,
        platform,
        source_url: "manual://paste-thread-url",
        evidence: "[needs_url][source=scaffold] Paste a real Reddit thread URL after you find one",
        why_now: `[FALLBACK] Reddit discussions about ${problem} reward value-first comments.`,
        suggested_action:
          "Answer the question helpfully; mention the product only if rules allow and it fits.",
        draft: `I've been deep in this problem while building ${company}. Here's what worked for us…`,
        risks:
          "Read subreddit rules. Never spam. Prefer communities the founder already participates in.",
      };
    case "linkedin":
      return {
        ...base,
        platform,
        source_url: "manual://paste-linkedin-post-or-use-composer",
        evidence:
          "[needs_url][source=scaffold] Founder-post draft — publish manually; paste a target post URL if commenting",
        why_now: "[FALLBACK] Founder-led posts outperform brand pages for early-stage credibility.",
        suggested_action: "Post as the founder; invite comments from people who've felt the pain.",
        draft: `${angle}\n\nBuilding ${company} taught me something specific about ${problem}.\n\nCurious: how are you solving this today?`,
        risks: "Keep it personal and specific. No engagement-bait templates.",
      };
    case "discord":
      return {
        ...base,
        platform,
        source_url: "manual://paste-community-url",
        evidence:
          "[needs_url][source=scaffold] Discord is opt-in only — paste a channel/thread URL from a community you already join",
        why_now:
          "[FALLBACK] Helpful answers in communities you already participate in can earn trust — never cold-spam servers.",
        suggested_action:
          "Paste a real channel/thread URL from an opted-in community, then post a helpful reply (no unsolicited DMs).",
        draft: `I've been working through ${problem} while building ${company}. Here's a concrete thing that helped…`,
        risks:
          "Opt-in communities only. Never unsolicited DMs. Respect server rules. Manual scaffold — not Hermes research.",
      };
    case "hackernews":
      return {
        ...base,
        platform,
        source_url: "manual://paste-hn-item-url",
        evidence: "[needs_url][source=scaffold] Paste a real HN item URL",
        why_now: "[FALLBACK] HN rewards careful, technical, non-salesy comments.",
        suggested_action: "Comment conservatively; lead with substance, not the product.",
        draft: `On ${problem}: one concrete tradeoff we hit building ${company} was…`,
        risks: "No hype. Disclose affiliation if you mention the product. Manual scaffold.",
      };
    case "producthunt":
      return {
        ...base,
        platform,
        source_url: "manual://paste-ph-launch-or-discussion-url",
        evidence: "[needs_url][source=scaffold] Paste a PH discussion/launch URL when ready",
        why_now: "[FALLBACK] PH is for launch assets and maker comments — founder-led.",
        suggested_action: "Prepare maker-comment / FAQ style draft; launch manually.",
        draft: `${company}: ${angle}\n\nHappy to answer maker questions about ${problem}.`,
        risks: "No fake upvotes. Founder-led launch only. Manual scaffold.",
      };
  }
}

/** One starter card per approved surface only. */
function scaffoldOpportunities(
  angle: string,
  dossier: Dossier | null,
  domain: string,
  surfaces: DistributionPlatform[],
): OpportunityDraft[] {
  const company = dossier?.company || domain;
  const problem = dossier?.positioning?.slice(0, 160) || `what ${company} helps people do`;
  const list: DistributionPlatform[] = surfaces.length
    ? surfaces.slice(0, 3)
    : ["x", "reddit", "linkedin"];
  return list.map((p) => scaffoldCard(p, angle, company, problem));
}

function isNeedsUrlRow(source_url: string, evidence: string | null): boolean {
  return (
    /manual:\/\//i.test(source_url) &&
    typeof evidence === "string" &&
    /^\[needs_url\]/i.test(evidence.trim())
  );
}

function isBadHttpUrl(source_url: string): boolean {
  if (!source_url.startsWith("http")) return true;
  return /x\.com\/search|twitter\.com\/search|linkedin\.com\/feed\/?$/i.test(source_url);
}

function parseOpportunities(
  raw: unknown,
  allowedSurfaces: DistributionPlatform[],
): OpportunityDraft[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { opportunities?: unknown })?.opportunities)
      ? (raw as { opportunities: unknown[] }).opportunities
      : null;
  if (!arr?.length) return [];

  const allowed = new Set(allowedSurfaces.length ? allowedSurfaces : DISTRIBUTION_PLATFORMS);
  const opportunities: OpportunityDraft[] = [];
  const seenPlatform = new Set<DistributionPlatform>();

  for (const item of arr.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const platform = DISTRIBUTION_PLATFORMS.includes(o.platform as DistributionPlatform)
      ? (o.platform as DistributionPlatform)
      : null;
    if (!platform || !allowed.has(platform)) continue;
    if (seenPlatform.has(platform)) continue;

    const source_url = typeof o.source_url === "string" ? o.source_url.trim() : "";
    const why_now = typeof o.why_now === "string" ? o.why_now : "";
    const suggested_action = typeof o.suggested_action === "string" ? o.suggested_action : "";
    const draft = typeof o.draft === "string" ? o.draft : "";
    const evidence = typeof o.evidence === "string" ? o.evidence : null;
    if (!why_now || !suggested_action || !draft || !source_url) continue;

    const needsUrl = isNeedsUrlRow(source_url, evidence);
    if (!needsUrl && isBadHttpUrl(source_url)) continue;
    if (!needsUrl && /manual:\/\//i.test(source_url)) continue;

    seenPlatform.add(platform);
    opportunities.push({
      campaign_id: null,
      platform,
      source_url,
      evidence,
      why_now,
      suggested_action,
      draft,
      risks: typeof o.risks === "string" ? o.risks : null,
      format_used: typeof o.format_used === "string" ? o.format_used : null,
      format_why: typeof o.format_why === "string" ? o.format_why : null,
      approval_status: "needs_review",
      action_status: "draft",
      outcome: "none",
      agent_skill: `${platform}_distribution`,
    });
  }
  return opportunities;
}

export async function recommendDistributionPlan(input: {
  sessionId: string;
  domain: string;
  dossier: Dossier | null;
  reviseNote?: string;
}): Promise<RecommendPlanResult> {
  const offline = fallbackPlan(input.domain, input.dossier, input.reviseNote);
  if (!hermesConfigured()) {
    return {
      plan: offline,
      source: "fallback",
      note: "Hermes unavailable — starter plan. Edit and approve, or connect Hermes.",
    };
  }

  const text = await completeOrNull({
    agent: "distribution-manager",
    kind: "distribution_plan",
    continuity: "campaign",
    input: await recommendPrompt({
      domain: input.domain,
      dossier: input.dossier,
      reviseNote: input.reviseNote,
    }),
    kamiSessionId: input.sessionId,
    timeoutMs: 90_000,
    meta: { reviseNote: input.reviseNote ?? null },
  });

  if (text) {
    const parsed = parsePlanJson(parseLastJsonBlock(text), input.reviseNote);
    if (parsed) {
      return {
        plan: {
          ...parsed,
          hermes_session_id: managerSessionId(input.sessionId),
        },
        source: "hermes",
      };
    }
  }

  return {
    plan: offline,
    source: "fallback",
    note: "Hermes returned no parseable plan — showing starter plan.",
  };
}

export async function researchViaManager(input: {
  sessionId: string;
  plan: DistributionPlan;
  domain: string;
  dossier: Dossier | null;
}): Promise<ResearchResult> {
  const angle = input.plan.angle || "";
  const surfaces = planSurfaces(input.plan);
  const scaffold = scaffoldOpportunities(angle, input.dossier, input.domain, surfaces);
  const scaffoldNote = (reason: string) =>
    `${reason} Starter queue matches your approved surfaces (${surfaces.join(", ")}) only — not live Hermes research.`;

  if (!hermesConfigured()) {
    return {
      opportunities: scaffold,
      source: "scaffold",
      note: scaffoldNote("Hermes unavailable."),
    };
  }

  try {
    const text = await completeOrNull({
      agent: "distribution-manager",
      kind: "distribution_research",
      continuity: "campaign",
      input: await researchPrompt({
        domain: input.domain,
        dossier: input.dossier,
        plan: input.plan,
      }),
      kamiSessionId: input.sessionId,
      timeoutMs: 240_000,
      meta: {
        goal: input.plan.goal,
        angle: input.plan.angle,
        surfaces,
      },
    });

    if (!text) {
      return {
        opportunities: scaffold,
        source: "scaffold",
        note: scaffoldNote("Hermes manager returned empty."),
      };
    }

    const opportunities = parseOpportunities(parseLastJsonBlock(text), surfaces);
    if (!opportunities.length) {
      return {
        opportunities: scaffold,
        source: "scaffold",
        note: scaffoldNote("Manager/specialists returned no usable rows for your surfaces."),
      };
    }

    // Fill any missing approved surfaces with needs_url scaffold cards so Discord etc. never disappear.
    const have = new Set(opportunities.map((o) => o.platform));
    const merged = [...opportunities];
    for (const p of surfaces) {
      if (!have.has(p)) {
        const fill = scaffold.find((s) => s.platform === p);
        if (fill) merged.push(fill);
      }
    }

    const hermesCount = merged.filter((o) => !/\[source=scaffold\]/i.test(o.evidence ?? "")).length;
    return {
      opportunities: merged,
      source: hermesCount > 0 ? "hermes" : "scaffold",
      note:
        hermesCount > 0
          ? `Hermes researched ${hermesCount}/${merged.length} surface(s); missing surfaces kept as needs_url starters.`
          : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "hermes failed";
    return { opportunities: scaffold, source: "scaffold", note: scaffoldNote(msg) };
  }
}
