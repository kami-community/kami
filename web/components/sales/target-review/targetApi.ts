import { api, withQuery } from "@/lib/client/api";
import {
  hasEligibleEmail,
  isIncluded,
  mergeScores,
  type AccountWithMeta,
  type ScoreRow,
} from "./rules";

/** Browser calls for the Find step. Errors surface as `ApiError`s for the caller to show. */

export interface DiscoverResponse {
  count: number;
  accounts: { email?: string | null }[];
  warnings: string[];
}

export interface FindContactsResponse {
  found: number;
  tried: number;
  message: string;
}

export interface SequenceResponse {
  enrolled_count: number;
  skipped: { account_id: string; reason: string }[];
}

/** Accounts with their contact, signals and latest score. */
export async function loadTargetAccounts(sessionId: string): Promise<AccountWithMeta[]> {
  const [accounts, scores] = await Promise.all([
    api.get<{ accounts: AccountWithMeta[] }>(
      withQuery("/api/sales/accounts", { session_id: sessionId }),
    ),
    api.get<{ scores: ScoreRow[] }>(withQuery("/api/sales/scores", { session_id: sessionId })),
  ]);
  return mergeScores(accounts.accounts, scores.scores);
}

export function setIncluded(sessionId: string, accountId: string, included: boolean) {
  return api.post("/api/sales/scores", { session_id: sessionId, account_id: accountId, included });
}

/** Include every not-yet-included account that has a sequence-eligible email. Returns how many. */
export async function includeAccountsWithEmail(
  sessionId: string,
  accounts: AccountWithMeta[],
): Promise<number> {
  const targets = accounts.filter((a) => a.id && hasEligibleEmail(a) && !isIncluded(a));
  for (const acc of targets) await setIncluded(sessionId, acc.id!, true);
  return targets.length;
}

export function discover(sessionId: string) {
  return api.post<DiscoverResponse>("/api/sales/discover", { session_id: sessionId });
}

export function findContacts(sessionId: string, accountIds: string[]) {
  return api.post<FindContactsResponse>("/api/sales/contacts/find", {
    session_id: sessionId,
    account_ids: accountIds,
  });
}

export function saveContactEmail(sessionId: string, account: AccountWithMeta, email: string) {
  return api.post("/api/sales/contacts", {
    session_id: sessionId,
    account_id: account.id,
    name: account.name,
    email: email.trim(),
  });
}

export function createSequences(sessionId: string, accountIds: string[]) {
  return api.post<SequenceResponse>("/api/sales/sequences", {
    session_id: sessionId,
    account_ids: accountIds,
  });
}
