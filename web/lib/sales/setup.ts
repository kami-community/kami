import { z } from "zod";
import { assertDossierConfirmed } from "@/lib/campaigns/sessions";
import type { Db } from "@/lib/db/client";
import { notFound } from "@/lib/http/errors";
import { setupInvalidatesSegments } from "@/lib/salesSetupIntegrity";
import type { SalesCampaignConfig } from "@/lib/salesTypes";
import { rowToConfig, type Row } from "./rows";
import { audit, dbError, now } from "./shared";

/**
 * Sales campaign setup: who to sell to and what to say. Domain-first — the
 * founder must have confirmed the company dossier before any of this.
 * The area pause (`autonomous_paused`) changes only through `setSalesPaused`;
 * the campaign-wide kill switch is `agent_sessions.paused`.
 */

const text = (max: number) => z.string().trim().max(max);

export const SalesSetupInput = z.object({
  client_id: text(200).optional(),
  offer: text(2000).min(1, "offer is required"),
  icp: z
    .object({
      titles: z.array(text(200)).max(50).default([]),
      industries: z.array(text(200)).max(50).default([]),
      size: text(200).optional(),
      geo: text(200).optional(),
    })
    .default({ titles: [], industries: [] }),
  geo: text(200).optional(),
  exclusions: z.array(text(300)).max(200).optional(),
  deal_range: z
    .object({
      min: z.number().nonnegative().optional(),
      max: z.number().nonnegative().optional(),
      currency: text(10).optional(),
    })
    .optional(),
  approved_claims: z.array(text(500)).max(50).optional(),
  target_quantity: z.number().int().min(1).max(500).optional(),
  sender_identity: z
    .object({
      name: text(200),
      email: z.string().trim().email().optional(),
      title: text(200).optional(),
      company: text(200).optional(),
    })
    .optional(),
  daily_send_cap: z.number().int().min(1).max(500).optional(),
  allowed_channels: z
    .array(z.enum(["email", "x"]))
    .min(1)
    .optional(),
  autonomy: z
    .object({
      auto_followups: z.boolean().optional(),
      require_first_send_approval: z.boolean().optional(),
    })
    .optional(),
});
export type SalesSetupInput = z.output<typeof SalesSetupInput>;

export async function getSalesConfig(
  db: Db,
  sessionId: string,
): Promise<SalesCampaignConfig | null> {
  const { data, error } = await db
    .from("sales_campaigns")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw dbError(error);
  return data ? rowToConfig(data as Row) : null;
}

export async function saveSalesSetup(db: Db, sessionId: string, input: SalesSetupInput) {
  await assertDossierConfirmed(db, sessionId);

  const { data: existing, error: existingError } = await db
    .from("sales_campaigns")
    .select("id, offer, icp, geo")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (existingError) throw dbError(existingError);

  const geo = input.geo || null;
  const invalidate = setupInvalidatesSegments(existing, {
    offer: input.offer,
    icp: input.icp,
    geo,
  });

  const row: Row = {
    session_id: sessionId,
    client_id: input.client_id ?? null,
    offer: input.offer,
    icp: input.icp,
    geo,
    exclusions: input.exclusions ?? null,
    deal_range: input.deal_range ?? null,
    approved_claims: input.approved_claims ?? null,
    target_quantity: input.target_quantity ?? 50,
    sender_identity: input.sender_identity ?? null,
    daily_send_cap: input.daily_send_cap ?? 35,
    allowed_channels: input.allowed_channels ?? ["email"],
    updated_at: now(),
  };
  if (invalidate) {
    row.segments = null;
    row.segments_confirmed_at = null;
  }
  if (input.autonomy?.auto_followups !== undefined) {
    row.auto_followups = input.autonomy.auto_followups;
  }
  if (input.autonomy?.require_first_send_approval !== undefined) {
    row.require_first_send_approval = input.autonomy.require_first_send_approval;
  }

  const { data, error } = await db
    .from("sales_campaigns")
    .upsert(row, { onConflict: "session_id" })
    .select("*")
    .single();
  if (error) throw dbError(error, "could not save the sales setup");

  if (invalidate) {
    await audit(db, {
      sessionId,
      actor: "system",
      action: "segments_invalidated",
      entityType: "sales_campaign",
      entityId: data.id,
      payload: { reason: "setup_offer_or_icp_changed" },
    });
  }

  return {
    persisted: true as const,
    id: data.id as string,
    config: rowToConfig(data as Row),
    segments_invalidated: invalidate,
  };
}

/** Pause or resume autonomous Sales actions for this campaign. */
export async function setSalesPaused(db: Db, sessionId: string, paused: boolean) {
  await assertDossierConfirmed(db, sessionId);
  const { data, error } = await db
    .from("sales_campaigns")
    .update({ autonomous_paused: paused, updated_at: now() })
    .eq("session_id", sessionId)
    .select("*")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw notFound("no sales campaign for this session — run setup first");

  await audit(db, {
    sessionId,
    actor: "user",
    action: paused ? "sales_paused" : "sales_resumed",
    entityType: "sales_campaign",
    entityId: data.id,
  });
  return { persisted: true as const, config: rowToConfig(data as Row) };
}
