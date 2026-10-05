import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { badRequest } from "@/lib/http/errors";
import type { AccountSignal, PipelineStage, SalesAccount } from "@/lib/salesTypes";
import { rowToAccount, type Row } from "./rows";
import { primaryContactByAccount, stageTransitionError, type AccountContactSummary } from "./rules";
import { audit, dbError, loadAccount, now } from "./shared";

/** Target accounts for a Sales campaign: list, detail, manual import, pipeline moves. */

export interface AccountListItem extends SalesAccount {
  signals: AccountSignal[];
  contact: AccountContactSummary | null;
}

export async function listAccounts(db: Db, sessionId: string): Promise<AccountListItem[]> {
  const { data: accounts, error } = await db
    .from("sales_accounts")
    .select("*")
    .eq("session_id", sessionId)
    .order("updated_at", { ascending: false });
  if (error) throw dbError(error);
  if (!accounts?.length) return [];

  const accountIds = accounts.map((a) => a.id as string);
  const [signalsResult, contactsResult] = await Promise.all([
    db
      .from("sales_account_signals")
      .select("*")
      .eq("session_id", sessionId)
      .in("account_id", accountIds)
      .order("captured_at", { ascending: false }),
    db
      .from("sales_contacts")
      .select("id, account_id, name, email, email_verification")
      .eq("session_id", sessionId)
      .in("account_id", accountIds),
  ]);
  if (signalsResult.error) throw dbError(signalsResult.error);
  if (contactsResult.error) throw dbError(contactsResult.error);

  const signalsByAccount = new Map<string, AccountSignal[]>();
  for (const s of signalsResult.data ?? []) {
    const list = signalsByAccount.get(s.account_id as string) ?? [];
    list.push(s as AccountSignal);
    signalsByAccount.set(s.account_id as string, list);
  }
  const contacts = primaryContactByAccount((contactsResult.data ?? []) as Row[]);

  return accounts.map((a) => ({
    ...rowToAccount(a as Row),
    signals: signalsByAccount.get(a.id as string) ?? [],
    contact: contacts.get(a.id as string) ?? null,
  }));
}

export async function getAccountDetail(db: Db, sessionId: string, accountId: string) {
  const account = await loadAccount(db, sessionId, accountId);
  const [signals, contacts, scores] = await Promise.all([
    db
      .from("sales_account_signals")
      .select("*")
      .eq("session_id", sessionId)
      .eq("account_id", accountId)
      .order("captured_at", { ascending: false }),
    db.from("sales_contacts").select("*").eq("session_id", sessionId).eq("account_id", accountId),
    db
      .from("sales_lead_scores")
      .select("*")
      .eq("session_id", sessionId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  for (const r of [signals, contacts, scores]) if (r.error) throw dbError(r.error);

  return {
    account: rowToAccount(account),
    signals: signals.data ?? [],
    contacts: contacts.data ?? [],
    lead_score: scores.data?.[0] ?? null,
  };
}

const PIPELINE_STAGES = [
  "researching",
  "ready_for_approval",
  "sequencing",
  "sent",
  "engaged",
  "qualified",
  "meeting_proposed",
  "invited",
  "accepted",
  "closed_won",
  "closed_lost",
  "invalid",
  "suppressed",
] as const satisfies readonly PipelineStage[];

export const PipelineStageSchema = z.enum(PIPELINE_STAGES);

export const AccountPatch = z.object({
  pipeline_stage: PipelineStageSchema.optional(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  industry: z.string().max(200).nullable().optional(),
});
export type AccountPatch = z.output<typeof AccountPatch>;

export async function updateAccount(
  db: Db,
  sessionId: string,
  accountId: string,
  patch: AccountPatch,
) {
  const existing = await loadAccount(db, sessionId, accountId);
  const from = existing.pipeline_stage as PipelineStage;
  const updates: Row = { updated_at: now() };

  if (patch.pipeline_stage) {
    const problem = stageTransitionError(from, patch.pipeline_stage);
    if (problem) throw badRequest(problem);
    updates.pipeline_stage = patch.pipeline_stage;
  }
  if (patch.tier !== undefined) updates.tier = patch.tier;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.industry !== undefined) updates.industry = patch.industry;

  const { data, error } = await db
    .from("sales_accounts")
    .update(updates)
    .eq("id", accountId)
    .eq("session_id", sessionId)
    .select("*")
    .single();
  if (error) throw dbError(error, "could not update the account");

  if (patch.pipeline_stage && patch.pipeline_stage !== from) {
    await audit(db, {
      sessionId,
      actor: "user",
      action: "pipeline_stage_change",
      entityType: "sales_account",
      entityId: accountId,
      payload: { from, to: patch.pipeline_stage },
    });
  }
  return { persisted: true as const, account: rowToAccount(data as Row) };
}

export const ManualAccount = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().toLowerCase().max(253).optional(),
  industry: z.string().trim().max(200).optional(),
  size: z.string().trim().max(100).optional(),
  geo: z.string().trim().max(200).optional(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  notes: z.string().max(5000).optional(),
  signals: z
    .array(
      z.object({
        provider: z.string().max(50).default("manual"),
        signal_type: z.string().max(100).default("unknown"),
        detail: z.string().max(2000).default(""),
        source_url: z.string().url().optional(),
        observed_at: z.string().datetime({ offset: true }).optional(),
        confidence: z.number().min(0).max(1).optional(),
        evidence_text: z.string().max(5000).optional(),
      }),
    )
    .max(50)
    .default([]),
});
export type ManualAccount = z.output<typeof ManualAccount>;

/** Import accounts by hand (deduped by domain, or name when there is no domain). */
export async function upsertAccounts(db: Db, sessionId: string, accounts: ManualAccount[]) {
  const { data: campaign, error: campaignError } = await db
    .from("sales_campaigns")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (campaignError) throw dbError(campaignError);

  const upserted: SalesAccount[] = [];
  for (const acc of accounts) {
    const key = acc.domain || acc.name;
    const { data: existing, error: findError } = await db
      .from("sales_accounts")
      .select("id")
      .eq("session_id", sessionId)
      .eq(acc.domain ? "domain" : "name", key)
      .limit(1)
      .maybeSingle();
    if (findError) throw dbError(findError);

    const row = {
      session_id: sessionId,
      sales_campaign_id: campaign?.id ?? null,
      name: acc.name,
      domain: acc.domain || null,
      industry: acc.industry ?? null,
      size: acc.size ?? null,
      geo: acc.geo ?? null,
      tier: acc.tier ?? null,
      notes: acc.notes ?? null,
      updated_at: now(),
    };
    const write = existing
      ? db.from("sales_accounts").update(row).eq("id", existing.id).eq("session_id", sessionId)
      : db.from("sales_accounts").insert({ ...row, pipeline_stage: "researching" });
    const { data, error } = await write.select("*").single();
    if (error) throw dbError(error, `could not save account ${acc.name}`);
    upserted.push(rowToAccount(data as Row));

    if (acc.signals.length) {
      const { error: signalError } = await db.from("sales_account_signals").insert(
        acc.signals.map((sig) => ({
          session_id: sessionId,
          account_id: data.id,
          provider: sig.provider,
          signal_type: sig.signal_type,
          detail: sig.detail,
          source_url: sig.source_url ?? null,
          observed_at: sig.observed_at ?? null,
          confidence: sig.confidence ?? null,
          evidence_text: sig.evidence_text ?? null,
        })),
      );
      if (signalError) throw dbError(signalError, `could not save signals for ${acc.name}`);
    }
  }
  return { persisted: true as const, accounts: upserted };
}
