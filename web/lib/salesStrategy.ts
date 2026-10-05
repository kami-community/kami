/**
 * Hermes sales strategist — produces a validated SalesPlan from domain-truth context.
 * Offline fallback remains synthesizePlanFromConfig (explicitly labeled).
 */

import type { Dossier } from "@/lib/hermes";
import { buildCompanyContextPack } from "@/lib/guideContext";
import { hermesChatOnce, hermesGatewayConfigured, parseLastJsonBlock } from "@/lib/hermesServer";
import { synthesizePlanFromConfig } from "@/lib/salesPlan";
import type { SalesSegment } from "@/lib/salesSegments";
import type {
  ApprovalScope,
  EstimatedActivity,
  SalesCampaignConfig,
  SalesChannel,
  SalesMotion,
  SalesPlan,
  SalesPlanMotion,
  SalesPlanTier,
} from "@/lib/salesTypes";

export interface StrategistResult {
  plan: Omit<SalesPlan, "id" | "created_at" | "updated_at">;
  source: "hermes" | "offline_fallback";
  note?: string;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function normalizeMotion(raw: unknown): SalesPlanMotion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const allowed: SalesMotion[] = ["outbound_email", "signal_outreach", "x_dm", "multi_channel"];
  const motionRaw = typeof o.motion === "string" ? o.motion : "signal_outreach";
  const motion = (
    allowed.includes(motionRaw as SalesMotion) ? motionRaw : "signal_outreach"
  ) as SalesMotion;
  const rationale = typeof o.rationale === "string" ? o.rationale.trim() : "";
  if (!rationale) return null;
  const channel = (
    typeof o.primary_channel === "string" ? o.primary_channel : "email"
  ) as SalesChannel;
  return {
    motion,
    rationale,
    primary_channel: channel === "x" ? "x" : "email",
  };
}

function normalizeTier(raw: unknown, fallbackQty: number): SalesPlanTier[] {
  if (!Array.isArray(raw) || !raw.length) {
    return [
      {
        tier: 1,
        label: "Best fit + recent signal",
        criteria: "Best-fit + recent buying signal + real contact",
        target_count: Math.max(1, Math.ceil(fallbackQty * 0.3)),
        channels: ["email"],
      },
      {
        tier: 2,
        label: "Strong fit",
        criteria: "Good fit, older or weaker signal",
        target_count: Math.max(1, Math.ceil(fallbackQty * 0.4)),
        channels: ["email"],
      },
      {
        tier: 3,
        label: "Light touch / nurture",
        criteria: "Partial fit or no dated signal — hold or nurture",
        target_count: Math.max(1, Math.ceil(fallbackQty * 0.3)),
        channels: ["email"],
      },
    ];
  }
  const out: SalesPlanTier[] = [];
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const tier = Number(o.tier);
    if (![1, 2, 3].includes(tier)) continue;
    out.push({
      tier: tier as 1 | 2 | 3,
      label: typeof o.label === "string" ? o.label : `Tier ${tier}`,
      criteria: typeof o.criteria === "string" ? o.criteria : "",
      target_count: Math.max(1, Number(o.target_count) || 5),
      channels: (Array.isArray(o.channels) ? o.channels : ["email"]).filter(
        (c): c is SalesChannel => c === "email" || c === "x",
      ),
    });
  }
  return out.length ? out : normalizeTier(null, fallbackQty);
}

function parseStrategistPlan(
  raw: unknown,
  config: SalesCampaignConfig,
  campaignId: string,
  version: number,
): Omit<SalesPlan, "id" | "created_at" | "updated_at"> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const motions = (Array.isArray(o.motions) ? o.motions : [])
    .map(normalizeMotion)
    .filter((m): m is SalesPlanMotion => Boolean(m));
  if (!motions.length) return null;

  const qty = config.target_quantity ?? 15;
  const tiers = normalizeTier(o.tiers, qty);
  const channel_rationale =
    typeof o.channel_rationale === "string" && o.channel_rationale.trim()
      ? o.channel_rationale.trim()
      : null;
  if (!channel_rationale) return null;

  const risks = asStringArray(o.risks);
  const prerequisites = asStringArray(o.prerequisites);
  const approvalRaw = asStringArray(o.approval_scope) as ApprovalScope[];
  const approval_scope: ApprovalScope[] =
    approvalRaw.length > 0 ? approvalRaw : ["sequence_activation", "target_cohort", "first_send"];

  let estimated_activity: EstimatedActivity = {
    accounts_to_research: qty,
    contacts_expected: Math.ceil(qty * 1.2),
    sends_per_week: Math.min(config.daily_send_cap ?? 35, 35) * 5,
    followups_per_week: Math.ceil(qty * 0.2),
  };
  if (o.estimated_activity && typeof o.estimated_activity === "object") {
    const e = o.estimated_activity as Record<string, unknown>;
    estimated_activity = {
      accounts_to_research: Number(e.accounts_to_research) || qty,
      contacts_expected: Number(e.contacts_expected) || Math.ceil(qty * 1.2),
      sends_per_week: Number(e.sends_per_week) || Math.min(config.daily_send_cap ?? 35, 35) * 5,
      followups_per_week: Number(e.followups_per_week) || Math.ceil(qty * 0.2),
    };
  }

  return {
    session_id: config.session_id,
    sales_campaign_id: campaignId,
    version,
    motions,
    tiers,
    channel_rationale,
    risks: risks.length ? risks : ["Thin signal coverage may limit Tier 1 volume"],
    prerequisites: prerequisites.length
      ? prerequisites
      : ["ICP segments confirmed", "Domain identity validated"],
    estimated_activity,
    approval_scope,
    status: "draft",
  };
}

function strategistPrompt(params: {
  domain: string;
  dossier: Dossier | null;
  config: SalesCampaignConfig;
  segments: SalesSegment[] | null;
  goals: string[];
}): string {
  const pack = buildCompanyContextPack({
    dossier: params.dossier,
    domain: params.domain,
    salesConfig: params.config,
    goals: params.goals,
    canonicalDomain: params.dossier?.canonical_domain ?? params.domain,
  });

  const segBlock = params.segments?.length
    ? params.segments
        .map(
          (s) =>
            `- ${s.name} [${s.motion}] persona=${s.target_persona} budget=${s.target_count}; why=${s.why_fit}; trigger=${s.trigger_signal}; candidates=${s.candidate_companies.map((c) => c.domain).join(",") || "none"}`,
        )
        .join("\n")
    : "(no confirmed segments — plan must say research confirmation is needed)";

  const goalLine = params.goals.length
    ? `Goals: ${params.goals.join("; ")}`
    : "Goals: not set — keep CTAs product-neutral";

  return `You are Kami's sales strategist for canonical domain ${params.domain}.
${goalLine}
Offer (from setup): ${params.config.offer}

CRITICAL:
- Plan ONLY for this product / domain. Never invent healthcare, scheduling, Calendly, or booking narratives unless the company pack supports them.
- If segments or evidence are thin, say so in risks/prerequisites — do not fabricate industry-specific tactics.
- Prefer signal-backed outreach; no signal = nurture/hold, not "high intent".

Confirmed segments:
${segBlock}

${pack}

Output ONLY a fenced json block:
\`\`\`json
{
  "motions": [
    {
      "motion": "signal_outreach",
      "rationale": "why this motion for THIS product and these segments",
      "primary_channel": "email"
    }
  ],
  "tiers": [
    { "tier": 1, "label": "...", "criteria": "...", "target_count": 5, "channels": ["email"] },
    { "tier": 2, "label": "...", "criteria": "...", "target_count": 5, "channels": ["email"] },
    { "tier": 3, "label": "...", "criteria": "...", "target_count": 5, "channels": ["email"] }
  ],
  "channel_rationale": "why email (and optional x) for these buyers",
  "risks": ["..."],
  "prerequisites": ["..."],
  "estimated_activity": {
    "accounts_to_research": 15,
    "contacts_expected": 18,
    "sends_per_week": 50,
    "followups_per_week": 3
  },
  "approval_scope": ["first_send", "sequence_activation", "target_cohort"]
}
\`\`\``;
}

/**
 * Prefer Hermes strategist; fall back to deterministic offline scaffold with explicit note.
 */
export async function generateSalesStrategy(params: {
  domain: string;
  dossier: Dossier | null;
  config: SalesCampaignConfig;
  campaignId: string;
  version: number;
  segments?: SalesSegment[] | null;
  goals?: string[];
  hermesSessionId?: string;
  kamiSessionId?: string | null;
}): Promise<StrategistResult> {
  const segments = params.segments ?? null;
  const goals = params.goals ?? [];

  const thinEvidence =
    !params.dossier?.positioning?.trim() ||
    (!segments?.length &&
      !(params.config.icp?.titles?.length || params.config.icp?.industries?.length));

  if (!hermesGatewayConfigured()) {
    const plan = synthesizePlanFromConfig(
      params.config,
      params.campaignId,
      params.version,
      segments,
    );
    return {
      plan: thinEvidence
        ? {
            ...plan,
            channel_rationale: `Sales plan needs research confirmation. Offline scaffold only — ${plan.channel_rationale}`,
            risks: [
              "Sales plan needs research confirmation — Hermes unavailable and dossier/segments thin",
              ...(plan.risks ?? []),
            ],
          }
        : {
            ...plan,
            channel_rationale: `[Offline fallback] ${plan.channel_rationale}`,
          },
      source: "offline_fallback",
      note: thinEvidence
        ? "Sales plan needs research confirmation"
        : "Hermes unavailable — offline scaffold",
    };
  }

  const text = await hermesChatOnce({
    content: strategistPrompt({
      domain: params.domain,
      dossier: params.dossier,
      config: params.config,
      segments,
      goals,
    }),
    sessionId: params.hermesSessionId ?? `kami-sales-plan-${params.domain}`,
    kamiSessionId: params.kamiSessionId,
    kind: "sales_plan",
    agent: "sales_strategist",
    timeoutMs: 90_000,
  });

  if (text) {
    const parsed = parseLastJsonBlock(text);
    const plan = parseStrategistPlan(parsed, params.config, params.campaignId, params.version);
    if (plan) {
      return { plan, source: "hermes" };
    }
  }

  const fallback = synthesizePlanFromConfig(
    params.config,
    params.campaignId,
    params.version,
    segments,
  );
  return {
    plan: {
      ...fallback,
      channel_rationale: thinEvidence
        ? `Sales plan needs research confirmation. ${fallback.channel_rationale}`
        : `[Offline fallback — Hermes parse failed] ${fallback.channel_rationale}`,
      risks: [
        thinEvidence
          ? "Sales plan needs research confirmation"
          : "Hermes strategist unavailable or invalid JSON — using offline scaffold",
        ...(fallback.risks ?? []),
      ],
    },
    source: "offline_fallback",
    note: "Sales plan needs research confirmation",
  };
}
