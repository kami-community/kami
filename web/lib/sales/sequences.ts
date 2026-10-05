import { getCampaign } from "@/lib/campaigns/sessions";
import type { Db } from "@/lib/db/client";
import { isSequenceEligibleContact } from "@/lib/domain/contacts";
import { badRequest } from "@/lib/http/errors";
import { buildCompanyContextPack } from "@/lib/campaigns/contextPack";
import type { AccountSignal } from "@/lib/salesTypes";
import type { Row } from "./rows";
import { draftSequence } from "./outreachDrafts";
import { defaultSequenceName, sequenceSteps, touchpointRows } from "./rules";
import { audit, dbError, loadSalesCampaign, now } from "./shared";

/**
 * Email sequences: one 3-step draft sequence per selected account with a
 * sequence-eligible contact. Drafts land in the review queue; nothing sends here.
 */

export async function listSequences(db: Db, sessionId: string) {
  const [sequences, enrollments] = await Promise.all([
    db
      .from("sales_sequences")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
    db
      .from("sales_sequence_enrollments")
      .select("*, sales_contacts(name, email), sales_accounts(name, domain)")
      .eq("session_id", sessionId)
      .order("enrolled_at", { ascending: false }),
  ]);
  if (sequences.error) throw dbError(sequences.error);
  if (enrollments.error) throw dbError(enrollments.error);
  return { sequences: sequences.data ?? [], enrollments: enrollments.data ?? [] };
}

export interface SkippedAccount {
  account_id: string;
  reason: string;
}

async function loadTargetAccounts(db: Db, sessionId: string, accountIds?: string[]) {
  let query = db.from("sales_accounts").select("*").eq("session_id", sessionId);
  query = accountIds?.length
    ? query.in("id", accountIds)
    : query.eq("pipeline_stage", "ready_for_approval");
  const { data, error } = await query;
  if (error) throw dbError(error);
  if (!data?.length) {
    throw badRequest("no eligible accounts — select accounts or include them for approval first");
  }
  return data as Row[];
}

async function eligibleContact(db: Db, sessionId: string, accountId: string): Promise<Row | null> {
  const { data, error } = await db
    .from("sales_contacts")
    .select("*")
    .eq("session_id", sessionId)
    .eq("account_id", accountId)
    .not("email", "is", null);
  if (error) throw dbError(error);
  return ((data ?? []) as Row[]).find((c) => isSequenceEligibleContact(c)) ?? null;
}

async function accountSignals(db: Db, sessionId: string, accountId: string) {
  const { data, error } = await db
    .from("sales_account_signals")
    .select("*")
    .eq("session_id", sessionId)
    .eq("account_id", accountId)
    .order("captured_at", { ascending: false });
  if (error) throw dbError(error);
  return (data ?? []) as AccountSignal[];
}

/** Enroll one account; returns the enrollment id or the reason it was skipped. */
async function enrollAccount(
  db: Db,
  ctx: { sessionId: string; sequenceId: string; campaign: Row; goal: string; contextPack: string },
  account: Row,
): Promise<{ enrollmentId: string } | { skipped: string }> {
  const accountId = account.id as string;
  const contact = await eligibleContact(db, ctx.sessionId, accountId);
  if (!contact) return { skipped: "no verified contact email" };

  const sequence = await draftSequence({
    sessionId: ctx.sessionId,
    contextPack: ctx.contextPack,
    offer: ctx.campaign.offer as string,
    approvedClaims: (ctx.campaign.approved_claims as string[] | null) ?? [],
    goal: ctx.goal,
    account: {
      name: account.name as string,
      domain: account.domain as string | null,
      industry: account.industry as string | null,
    },
    contact: { name: contact.name as string | null, title: contact.title as string | null },
    signals: await accountSignals(db, ctx.sessionId, accountId),
  });

  const { data: enrollment, error: enrollError } = await db
    .from("sales_sequence_enrollments")
    .insert({
      session_id: ctx.sessionId,
      sequence_id: ctx.sequenceId,
      contact_id: contact.id,
      account_id: accountId,
      status: "awaiting_approval",
      current_step: 0,
    })
    .select("id")
    .single();
  if (enrollError) return { skipped: enrollError.message };

  const { error: draftError } = await db.from("sales_touchpoints").insert(
    touchpointRows(ctx.sessionId, enrollment.id as string, sequence.drafts, {
      source: sequence.source,
      notes: sequence.notes,
    }),
  );
  if (draftError) {
    // Do not leave an enrollment without drafts behind.
    const { error: cleanupError } = await db
      .from("sales_sequence_enrollments")
      .delete()
      .eq("id", enrollment.id)
      .eq("session_id", ctx.sessionId);
    if (cleanupError) throw dbError(cleanupError);
    return { skipped: draftError.message };
  }

  const { error: stageError } = await db
    .from("sales_accounts")
    .update({ pipeline_stage: "sequencing", updated_at: now() })
    .eq("id", accountId)
    .eq("session_id", ctx.sessionId);
  if (stageError) throw dbError(stageError);

  return { enrollmentId: enrollment.id as string };
}

export async function createSequence(
  db: Db,
  input: { sessionId: string; accountIds?: string[]; name?: string },
) {
  const { sessionId } = input;
  const campaign = await loadSalesCampaign(db, sessionId);
  const accounts = await loadTargetAccounts(db, sessionId, input.accountIds);
  const { session, dossier } = await getCampaign(db, sessionId);

  const { data: sequence, error } = await db
    .from("sales_sequences")
    .insert({
      session_id: sessionId,
      sales_campaign_id: campaign.id,
      name: input.name || defaultSequenceName(new Date()),
      channel: "email",
      steps: sequenceSteps(),
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw dbError(error, "could not create the sequence");

  const ctx = {
    sessionId,
    sequenceId: sequence.id as string,
    campaign,
    goal: session.goals[0] ?? "",
    contextPack: buildCompanyContextPack({
      dossier,
      domain: session.canonical_domain,
      goals: session.goals,
    }),
  };
  const enrolled: string[] = [];
  const skipped: SkippedAccount[] = [];
  for (const account of accounts) {
    const result = await enrollAccount(db, ctx, account);
    if ("enrollmentId" in result) enrolled.push(result.enrollmentId);
    else skipped.push({ account_id: account.id as string, reason: result.skipped });
  }

  await audit(db, {
    sessionId,
    actor: "system",
    action: "sequence_created",
    entityType: "sales_sequence",
    entityId: sequence.id as string,
    payload: { enrolled: enrolled.length, skipped },
  });

  return { persisted: true as const, sequence, enrolled_count: enrolled.length, skipped };
}
