import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesChannel } from "./salesTypes";

export type PolicyResult = { ok: true } | { ok: false; status: number; error: string };

function fail(status: number, error: string): PolicyResult {
  return { ok: false, status, error };
}

export async function assertCampaignNotPaused(
  sb: SupabaseClient,
  campaignId: string,
): Promise<PolicyResult> {
  const { data, error } = await sb
    .from("sales_campaigns")
    .select("autonomous_paused")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) return fail(500, error.message);
  if (!data) return fail(404, "sales campaign not found");
  if (data.autonomous_paused) return fail(403, "campaign autonomy is paused");

  return { ok: true };
}

interface AssertSendAllowedParams {
  sb: SupabaseClient;
  campaignId: string;
  recipient: string;
  channel: SalesChannel;
  draftApproved: boolean;
  reviewerApproved: boolean;
  isFirstSend: boolean;
}

export async function assertSendAllowed(params: AssertSendAllowedParams): Promise<PolicyResult> {
  const { sb, campaignId, recipient, channel, draftApproved, reviewerApproved, isFirstSend } =
    params;

  const { data: campaign, error: campErr } = await sb
    .from("sales_campaigns")
    .select(
      "autonomous_paused, daily_send_cap, allowed_channels, require_first_send_approval, session_id",
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (campErr) return fail(500, campErr.message);
  if (!campaign) return fail(404, "sales campaign not found");
  if (campaign.autonomous_paused) return fail(403, "campaign autonomy is paused");

  const allowedChannels: string[] = campaign.allowed_channels ?? ["email"];
  if (!allowedChannels.includes(channel)) {
    return fail(403, `channel ${channel} not allowed for this campaign`);
  }

  if (!draftApproved) return fail(403, "draft not approved");
  if (!reviewerApproved) return fail(403, "reviewer verdict not approved");

  if (isFirstSend && campaign.require_first_send_approval) {
    const { data: approval } = await sb
      .from("sales_approvals")
      .select("status")
      .eq("sales_campaign_id", campaignId)
      .eq("scope", "first_send")
      .eq("status", "approved")
      .maybeSingle();

    if (!approval) {
      return fail(403, "first send requires explicit user approval");
    }
  }

  const normalized = recipient.trim().toLowerCase();
  const domain = normalized.includes("@") ? normalized.split("@")[1] : normalized;

  const { data: globalDnc } = await sb
    .from("do_not_contact")
    .select("handle")
    .or(`handle.eq.${normalized},handle.eq.${domain},handle.eq.@${normalized.replace(/^@/, "")}`)
    .limit(1);

  if (globalDnc?.length) {
    return fail(403, "recipient is on do-not-contact list");
  }

  const { data: sessionDnc } = await sb
    .from("sales_suppression_entries")
    .select("identifier")
    .eq("session_id", campaign.session_id)
    .or(`identifier.eq.${normalized},identifier.eq.${domain}`)
    .limit(1);

  if (sessionDnc?.length) {
    return fail(403, "recipient is suppressed for this session");
  }

  const cap = campaign.daily_send_cap ?? 35;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count, error: countErr } = await sb
    .from("sales_execution_receipts")
    .select("id", { count: "exact", head: true })
    .eq("sales_campaign_id", campaignId)
    .eq("status", "sent")
    .gte("sent_at", startOfDay.toISOString());

  if (countErr) return fail(500, countErr.message);
  if ((count ?? 0) >= cap) {
    return fail(429, `daily send cap (${cap}) reached`);
  }

  return { ok: true };
}
