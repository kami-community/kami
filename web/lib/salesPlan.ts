import type {
  ApprovalScope,
  EstimatedActivity,
  SalesCampaignConfig,
  SalesChannel,
  SalesPlan,
  SalesPlanMotion,
  SalesPlanTier,
} from "@/lib/salesTypes";
import type { SalesSegment } from "@/lib/salesSegments";
import { cleanPositioningLine } from "@/lib/salesDossierPrefill";

/** Local strategist scaffold — Hermes shapes when available; this is the deterministic fallback. */
export function synthesizePlanFromConfig(
  config: SalesCampaignConfig,
  campaignId: string,
  version: number,
  segments?: SalesSegment[] | null,
): Omit<SalesPlan, "id" | "created_at" | "updated_at"> {
  const channels: SalesChannel[] = config.allowed_channels ?? ["email"];
  const segs = segments?.length ? segments : null;
  const targetQty =
    segs?.reduce((n, s) => n + (s.target_count || 0), 0) || config.target_quantity || 15;
  const hasEmail = channels.includes("email");
  const hasX = channels.includes("x");

  const positioning = cleanPositioningLine(config.offer, "Your product");
  const titles =
    segs?.map((s) => s.target_persona).join(", ") ||
    config.icp.titles?.join(", ") ||
    "decision-makers";
  const segmentNames =
    segs?.map((s) => s.name).join("; ") || config.icp.industries?.join(", ") || "target segments";
  const geo = config.geo || config.icp.geo || "target geos";

  const motions: SalesPlanMotion[] = [];
  if (hasEmail) {
    const why =
      segs
        ?.filter((s) => s.motion === "b2b_sales_assisted")
        .map((s) => s.why_fit)
        .slice(0, 2)
        .join(" ") || `research-backed cold email to ${titles}`;
    motions.push({
      motion: "signal_outreach",
      rationale: `${positioning} Reach ${segmentNames} in ${geo}: ${why}. Hooks use recent funding, hiring, or launch signals.`,
      primary_channel: "email",
    });
  }
  if (hasX) {
    motions.push({
      motion: "x_dm",
      rationale: `Individualized X outreach for high-intent accounts with visible public activity. Each DM requires manual approval in MVP.`,
      primary_channel: "x",
    });
  }
  if (motions.length === 0) {
    motions.push({
      motion: "outbound_email",
      rationale: `${positioning} Outbound email to ${titles}.`,
      primary_channel: "email",
    });
  }

  // Budgets from segment target_counts when present
  const t1 = segs
    ? Math.max(
        1,
        segs
          .filter((s) => s.motion === "b2b_sales_assisted")
          .reduce((n, s) => n + s.target_count, 0),
      )
    : Math.ceil(targetQty * 0.3);
  const t2 = segs ? Math.max(1, Math.ceil(targetQty * 0.35)) : Math.ceil(targetQty * 0.4);
  const t3 = Math.max(1, targetQty - t1 - t2);

  const tiers: SalesPlanTier[] = [
    {
      tier: 1,
      label: "Best fit + recent signal",
      criteria: "Best-fit + recent buying signal + real contact",
      target_count: t1,
      channels: hasEmail ? ["email"] : channels,
    },
    {
      tier: 2,
      label: "Strong fit",
      criteria: "Good fit, older or weaker signal",
      target_count: t2,
      channels: hasEmail ? ["email"] : channels,
    },
    {
      tier: 3,
      label: "Light touch",
      criteria: "Worth a light touch — partial fit, nurture cadence",
      target_count: t3,
      channels,
    },
  ];

  const approvalScope: ApprovalScope[] = ["sequence_activation", "target_cohort"];
  if (config.autonomy?.require_first_send_approval !== false) {
    approvalScope.push("first_send");
  }
  if (hasX) approvalScope.push("x_dm");
  approvalScope.push("calendar_invite");

  const estimated: EstimatedActivity = {
    accounts_to_research: targetQty,
    contacts_expected: Math.ceil(targetQty * 1.2),
    sends_per_week: Math.min(config.daily_send_cap ?? 35, 35) * 5,
    followups_per_week: Math.ceil(targetQty * 0.2),
  };

  const funnelBlurb = segs?.length
    ? `Funnel budgets: ${segs.map((s) => `${s.name} (~${s.target_count})`).join(" · ")}.`
    : "";

  return {
    session_id: config.session_id,
    sales_campaign_id: campaignId,
    version,
    motions,
    tiers,
    channel_rationale: hasEmail
      ? `${positioning} Primary channel: email to ${titles} across ${segmentNames}. Signal hooks lift reply rates. ${funnelBlurb}${hasX ? " X supplements Tier 1." : ""}`
      : `${positioning} X-only motion — individually reviewed, no bulk DMs. ${funnelBlurb}`,
    risks: [
      "Deliverability depends on sender DNS (SPF/DKIM/DMARC)",
      "Thin signal coverage may limit Tier 1 volume",
      ...(config.exclusions?.length
        ? [`Exclusions may shrink addressable market: ${config.exclusions.length} rules`]
        : []),
    ],
    prerequisites: [
      "ICP segments confirmed",
      "Approved claims locked in campaign config",
      ...(hasEmail ? ["AgentMail sender verified", "Working opt-out / suppression process"] : []),
      ...(hasX ? ["Connected X account", "Per-DM reviewer approval enabled"] : []),
    ],
    estimated_activity: estimated,
    approval_scope: approvalScope,
    status: "draft",
  };
}
