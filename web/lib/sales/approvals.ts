import type { Db } from "@/lib/db/client";
import { AppError, badRequest } from "@/lib/http/errors";
import type { ApprovalScope } from "@/lib/salesTypes";

/**
 * Campaign-level approvals the founder grants explicitly (e.g. the first send).
 * The outbound policy (`lib/outbound/policy.ts`) reads these before sending.
 */

export const APPROVAL_SCOPES = [
  "first_send",
  "sequence_activation",
  "x_dm",
  "calendar_invite",
  "claims_change",
  "target_cohort",
] as const satisfies readonly ApprovalScope[];

export async function grantApproval(
  db: Db,
  params: { sessionId: string; scope: ApprovalScope },
): Promise<{ persisted: true; approval: Record<string, unknown> }> {
  const { data: campaign, error: campaignErr } = await db
    .from("sales_campaigns")
    .select("id")
    .eq("session_id", params.sessionId)
    .maybeSingle();
  if (campaignErr) throw new AppError("internal", campaignErr.message);
  if (!campaign) throw badRequest("set up Sales for this campaign first");

  const { data: existing, error: existingErr } = await db
    .from("sales_approvals")
    .select("*")
    .eq("session_id", params.sessionId)
    .eq("sales_campaign_id", campaign.id)
    .eq("scope", params.scope)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingErr) throw new AppError("internal", existingErr.message);
  if (existing?.status === "approved") return { persisted: true, approval: existing };

  const decision = {
    status: "approved",
    decided_by: "user",
    decided_at: new Date().toISOString(),
  };

  const write = existing
    ? db.from("sales_approvals").update(decision).eq("id", existing.id)
    : db.from("sales_approvals").insert({
        session_id: params.sessionId,
        sales_campaign_id: campaign.id,
        scope: params.scope,
        entity_type: "sales_campaign",
        entity_id: campaign.id,
        requested_by: "user",
        ...decision,
      });
  const { data, error } = await write.select("*").single();
  if (error) throw new AppError("internal", error.message);
  return { persisted: true, approval: data };
}
