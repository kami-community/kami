import type { Db } from "@/lib/db/client";
import type { LeadScoreFactors } from "@/lib/salesTypes";
import { rowToAccount, type Row } from "./rows";
import { inclusionUpdate, latestByAccount } from "./rules";
import { audit, dbError, loadAccount, now } from "./shared";

/** Lead scores (Fit × Timing × Reachable) and the founder's include/exclude decision. */

export async function listScores(db: Db, sessionId: string) {
  const { data: scores, error } = await db
    .from("sales_lead_scores")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });
  if (error) throw dbError(error);

  const latest = latestByAccount((scores ?? []) as Row[]);
  const accountIds = [...latest.keys()];
  const accountById = new Map<string, Row>();
  if (accountIds.length) {
    const { data: accounts, error: accountError } = await db
      .from("sales_accounts")
      .select("*")
      .eq("session_id", sessionId)
      .in("id", accountIds);
    if (accountError) throw dbError(accountError);
    for (const a of accounts ?? []) accountById.set(a.id as string, a as Row);
  }

  return [...latest.values()].map((row) => {
    const account = accountById.get(row.account_id as string);
    return {
      id: row.id as string,
      account_id: row.account_id as string,
      model_version: row.model_version as string,
      factors: row.factors as LeadScoreFactors,
      explanation: row.explanation as string,
      evidence_refs: (row.evidence_refs as string[] | null) ?? undefined,
      recommended_tier: (row.recommended_tier as number | null) ?? undefined,
      recommended_channel: (row.recommended_channel as string | null) ?? undefined,
      created_at: row.created_at as string | undefined,
      account: account ? rowToAccount(account) : null,
    };
  });
}

/** Include an account in (or exclude it from) the cohort that gets drafted emails. */
export async function setInclusion(
  db: Db,
  sessionId: string,
  accountId: string,
  included: boolean,
) {
  const account = await loadAccount(db, sessionId, accountId);
  const update = inclusionUpdate(account.notes as string | null, included);

  const { data, error } = await db
    .from("sales_accounts")
    .update({ ...update, updated_at: now() })
    .eq("id", accountId)
    .eq("session_id", sessionId)
    .select("*")
    .single();
  if (error) throw dbError(error, "could not update the account");

  await audit(db, {
    sessionId,
    actor: "user",
    action: included ? "target_included" : "target_excluded",
    entityType: "sales_account",
    entityId: accountId,
    payload: { included, pipeline_stage: update.pipeline_stage },
  });
  return { persisted: true as const, account: rowToAccount(data as Row), included };
}
