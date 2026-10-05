import type { Db } from "@/lib/db/client";
import { AppError, forbidden, notFound, paused } from "@/lib/http/errors";
import { findSuppression, type SuppressionChannel } from "./suppressions";

/**
 * The send policy every outbound action passes before anything leaves Kami.
 * Each check throws a typed AppError; callers never branch on booleans.
 */

export type Area = "sales" | "marketing" | "distribution";

const AREA_PAUSE: Record<Area, { table: string; label: string }> = {
  sales: { table: "sales_campaigns", label: "Sales" },
  marketing: { table: "marketing_config", label: "Marketing outreach" },
  distribution: { table: "distribution_campaigns", label: "Distribution" },
};

/** The session kill switch ("Pause all") and the area's own pause flag. */
export async function assertNotPaused(db: Db, sessionId: string, area: Area): Promise<void> {
  const { data: session, error } = await db
    .from("agent_sessions")
    .select("paused")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!session) throw notFound("campaign session not found");
  if (session.paused) throw paused("Kami is paused for this campaign — resume to send");

  const { table, label } = AREA_PAUSE[area];
  const { data: areaRow, error: areaErr } = await db
    .from(table)
    .select("autonomous_paused")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (areaErr) throw new AppError("internal", areaErr.message);
  if (areaRow?.autonomous_paused) throw paused(`${label} is paused — resume it to send`);
}

export async function assertNotSuppressed(
  db: Db,
  params: { sessionId: string; channel: SuppressionChannel; recipient: string },
): Promise<void> {
  const hit = await findSuppression(db, params);
  if (hit) {
    throw forbidden(`${params.recipient} is on the suppression list (${hit.reason})`, {
      suppression_id: hit.id,
    });
  }
}

export interface SalesCampaignPolicy {
  id: string;
  session_id: string;
  daily_send_cap: number | null;
  allowed_channels: string[] | null;
  require_first_send_approval: boolean | null;
}

export async function loadSalesCampaignPolicy(
  db: Db,
  campaignId: string,
): Promise<SalesCampaignPolicy> {
  const { data, error } = await db
    .from("sales_campaigns")
    .select("id, session_id, daily_send_cap, allowed_channels, require_first_send_approval")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("sales campaign not found");
  return data as SalesCampaignPolicy;
}

export const DEFAULT_DAILY_SEND_CAP = 35;

/** Campaign-level rules for a sales send: channel, first-send approval, daily cap. */
export async function assertSalesSendAllowed(
  db: Db,
  campaign: SalesCampaignPolicy,
  channel: "email",
): Promise<void> {
  const allowed = campaign.allowed_channels ?? ["email"];
  if (!allowed.includes(channel))
    throw forbidden(`channel ${channel} is not allowed for this campaign`);

  const { count: sentTotal, error: totalErr } = await db
    .from("outbound_receipts")
    .select("id", { count: "exact", head: true })
    .eq("sales_campaign_id", campaign.id)
    .eq("status", "sent");
  if (totalErr) throw new AppError("internal", totalErr.message);

  if ((sentTotal ?? 0) === 0 && campaign.require_first_send_approval) {
    const { data: approval } = await db
      .from("sales_approvals")
      .select("id")
      .eq("sales_campaign_id", campaign.id)
      .eq("scope", "first_send")
      .eq("status", "approved")
      .maybeSingle();
    if (!approval) throw forbidden("the first send needs your explicit approval");
  }

  const cap = campaign.daily_send_cap ?? DEFAULT_DAILY_SEND_CAP;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count: sentToday, error: dayErr } = await db
    .from("outbound_receipts")
    .select("id", { count: "exact", head: true })
    .eq("sales_campaign_id", campaign.id)
    .eq("status", "sent")
    .gte("sent_at", startOfDay.toISOString());
  if (dayErr) throw new AppError("internal", dayErr.message);
  if ((sentToday ?? 0) >= cap) {
    throw new AppError("rate_limited", `daily send cap (${cap}) reached — sends resume tomorrow`, {
      daily_cap: cap,
    });
  }
}
