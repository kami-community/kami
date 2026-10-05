import { loadSession } from "@/lib/campaigns/sessions";
import type { Db } from "@/lib/db/client";
import { conflict } from "@/lib/http/errors";
import { findContactForDomain } from "@/lib/salesContactFinder";
import type { Row } from "./rows";
import { bumpContactability, foundContactRow } from "./rules";
import { assertSalesActive, audit, dbError, loadAccount, loadSalesCampaign, now } from "./shared";

/**
 * Contacts on target accounts. Never invent emails: an address is either
 * typed in by the founder (`founder_provided`) or found by the contact finder
 * on the company's own domain, with its evidence classification kept.
 */

/** The account's current contact row id, if any. */
async function existingContactId(
  db: Db,
  sessionId: string,
  accountId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("sales_contacts")
    .select("id")
    .eq("session_id", sessionId)
    .eq("account_id", accountId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error);
  return (data?.id as string | undefined) ?? null;
}

/** Insert or update the account's contact row. */
async function saveContact(db: Db, sessionId: string, accountId: string, row: Row): Promise<Row> {
  const id = await existingContactId(db, sessionId, accountId);
  const write = id
    ? db.from("sales_contacts").update(row).eq("id", id).eq("session_id", sessionId)
    : db.from("sales_contacts").insert(row);
  const { data, error } = await write.select("*").single();
  if (error) {
    if (error.code === "23505") {
      throw conflict(`${String(row.email)} is already a contact on another account`);
    }
    throw dbError(error, "could not save the contact");
  }
  return data as Row;
}

export async function addFounderContact(
  db: Db,
  input: { sessionId: string; accountId: string; email: string; name?: string },
) {
  const account = await loadAccount(db, input.sessionId, input.accountId);
  const email = input.email.trim().toLowerCase();
  const contact = await saveContact(db, input.sessionId, input.accountId, {
    session_id: input.sessionId,
    account_id: input.accountId,
    sales_campaign_id: account.sales_campaign_id ?? null,
    name: input.name || account.name,
    email,
    email_verification: "founder_provided",
    do_not_contact: false,
    updated_at: now(),
  });

  await audit(db, {
    sessionId: input.sessionId,
    actor: "user",
    action: "contact_email_added",
    entityType: "sales_contact",
    entityId: contact.id as string,
    payload: { account_id: input.accountId, email },
  });
  return { persisted: true as const, contact };
}

export type ContactLookupStatus = "found" | "not_found" | "already_had" | "skipped";

export interface ContactLookupResult {
  account_id: string;
  domain: string;
  email?: string;
  method?: string;
  source_url?: string;
  status: ContactLookupStatus;
}

async function existingEmail(db: Db, sessionId: string, accountId: string): Promise<string | null> {
  const { data, error } = await db
    .from("sales_contacts")
    .select("email")
    .eq("session_id", sessionId)
    .eq("account_id", accountId)
    .not("email", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error);
  return (data?.email as string | undefined) ?? null;
}

/** Raise contactability on the account's latest score now that an email exists. */
async function bumpLatestScore(
  db: Db,
  sessionId: string,
  accountId: string,
  found: { email: string; method?: string },
): Promise<void> {
  const { data: score, error } = await db
    .from("sales_lead_scores")
    .select("id, factors, explanation")
    .eq("session_id", sessionId)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!score) return;
  const { error: updateError } = await db
    .from("sales_lead_scores")
    .update(bumpContactability(score, found))
    .eq("id", score.id);
  if (updateError) throw dbError(updateError);
}

async function lookupAccount(db: Db, sessionId: string, account: Row): Promise<ContactLookupResult> {
  const accountId = account.id as string;
  const domain = (account.domain as string | null) ?? "";
  if (!domain) return { account_id: accountId, domain: "", status: "skipped" };

  const had = await existingEmail(db, sessionId, accountId);
  if (had) return { account_id: accountId, domain, email: had, status: "already_had" };

  const found = await findContactForDomain(domain, account.name as string, sessionId);
  if (!found?.email) return { account_id: accountId, domain, status: "not_found" };

  await saveContact(
    db,
    sessionId,
    accountId,
    foundContactRow({
      sessionId,
      accountId,
      campaignId: (account.sales_campaign_id as string | null) ?? null,
      accountName: account.name as string,
      contact: found,
      at: now(),
    }),
  );
  await bumpLatestScore(db, sessionId, accountId, found);
  return {
    account_id: accountId,
    domain,
    email: found.email,
    method: found.method,
    source_url: found.source_url,
    status: "found",
  };
}

/** Look up public contact emails (site scrape → web search → Hermes extract) for accounts. */
export async function findContacts(db: Db, sessionId: string, accountIds?: string[]) {
  const [session, campaign] = await Promise.all([
    loadSession(db, sessionId),
    loadSalesCampaign(db, sessionId),
  ]);
  assertSalesActive(session, campaign);

  let query = db
    .from("sales_accounts")
    .select("id, name, domain, sales_campaign_id")
    .eq("session_id", sessionId);
  if (accountIds?.length) query = query.in("id", accountIds);
  const { data: accounts, error } = await query;
  if (error) throw dbError(error);
  if (!accounts?.length) {
    return { found: 0, tried: 0, results: [], message: "No accounts to search" };
  }

  const results: ContactLookupResult[] = [];
  for (const account of accounts) results.push(await lookupAccount(db, sessionId, account as Row));
  const found = results.filter((r) => r.status === "found").length;

  await audit(db, {
    sessionId,
    actor: "system",
    action: "hermes_contact_lookup",
    entityType: "sales_campaign",
    entityId: campaign.id as string,
    payload: { found, tried: accounts.length, results },
  });

  return {
    found,
    tried: accounts.length,
    results,
    message:
      found > 0
        ? `Found ${found} contact email${found === 1 ? "" : "s"} via site scrape / web search / Hermes`
        : "No public emails found on company domains — add manually or uncheck those accounts",
  };
}
