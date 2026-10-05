import { logAgentRunAsync } from "@/lib/agentRunLog";
import { getCampaign } from "@/lib/campaigns/sessions";
import type { Db } from "@/lib/db/client";
import { normalizeSegments, type SalesSegment } from "@/lib/domain/segments";
import { badRequest } from "@/lib/http/errors";
import { researchFromSegments, type ResearchedAccount } from "@/lib/salesResearch";
import type { Row } from "./rows";
import {
  DISCOVERY_SCORE_MODEL,
  foundContactRow,
  partitionSignals,
  primaryChannel,
} from "./rules";
import { assertSalesActive, audit, dbError, loadSalesCampaign, now } from "./shared";

/**
 * Discovery: verify the companies named in the confirmed segments, attach
 * live signals and scores, and store any evidenced contact emails. Requires
 * confirmed segments and an approved plan. Each run is recorded in
 * `sales_discovery_runs`; re-runs update accounts, signals and scores in place.
 */

export interface DiscoveredAccount {
  id: string;
  name: string;
  domain: string;
  tier: number;
  pipeline_stage: string;
  signal_count: number;
  segment_key?: string;
  email?: string | null;
}

export interface DiscoveryResult {
  discovered: true;
  count: number;
  accounts: DiscoveredAccount[];
  discovery_run_id: string;
  warnings: string[];
}

interface RunContext {
  sessionId: string;
  campaign: Row;
  runId: string;
}

function confirmedSegments(campaign: Row): SalesSegment[] {
  const confirmed =
    campaign.segments_confirmed_at && Array.isArray(campaign.segments) && campaign.segments.length;
  if (!confirmed) {
    throw badRequest(
      "ICP segments not confirmed yet — confirm who you're selling to before finding companies",
    );
  }
  return normalizeSegments({ segments: campaign.segments });
}

async function loadApprovedPlanId(db: Db, sessionId: string): Promise<string> {
  const { data, error } = await db
    .from("sales_plans")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw badRequest("no approved sales plan — approve the plan before running discovery");
  return data.id as string;
}

async function startRun(
  db: Db,
  sessionId: string,
  campaignId: string,
  segments: SalesSegment[],
  researched: { accounts: ResearchedAccount[]; warnings: string[] },
): Promise<string> {
  const { data, error } = await db
    .from("sales_discovery_runs")
    .insert({
      session_id: sessionId,
      sales_campaign_id: campaignId,
      segment_snapshot: segments,
      warnings: researched.warnings,
      accounts_discovered: researched.accounts.length,
    })
    .select("id")
    .single();
  if (error) throw dbError(error, "could not record the discovery run");
  return data.id as string;
}

/** Insert or update the account (deduped by session + domain); returns its id. */
async function saveAccount(db: Db, ctx: RunContext, acc: ResearchedAccount): Promise<string> {
  const { data: existing, error: findError } = await db
    .from("sales_accounts")
    .select("id")
    .eq("session_id", ctx.sessionId)
    .eq("domain", acc.domain)
    .limit(1)
    .maybeSingle();
  if (findError) throw dbError(findError);

  const row = {
    session_id: ctx.sessionId,
    sales_campaign_id: ctx.campaign.id,
    name: acc.name,
    domain: acc.domain,
    industry: acc.industry ?? null,
    geo: acc.geo ?? null,
    pipeline_stage: "researching",
    tier: acc.tier,
    segment_key: acc.segment_key ?? null,
    notes: acc.notes ?? null,
    updated_at: now(),
  };
  const write = existing
    ? db.from("sales_accounts").update(row).eq("id", existing.id).eq("session_id", ctx.sessionId)
    : db.from("sales_accounts").insert(row);
  const { data, error } = await write.select("id").single();
  if (error) throw dbError(error, `could not save account ${acc.domain}`);
  return data.id as string;
}

/** Store new signals, re-tag already-known ones with this run; returns all signal ids. */
async function saveSignals(
  db: Db,
  ctx: RunContext,
  accountId: string,
  acc: ResearchedAccount,
): Promise<string[]> {
  if (!acc.signals.length) return [];
  const urls = acc.signals.map((s) => s.url).filter(Boolean);
  const existingIdByUrl = new Map<string, string>();
  if (urls.length) {
    const { data, error } = await db
      .from("sales_account_signals")
      .select("id, source_url")
      .eq("session_id", ctx.sessionId)
      .eq("account_id", accountId)
      .in("source_url", urls);
    if (error) throw dbError(error);
    for (const s of data ?? []) existingIdByUrl.set(s.source_url as string, s.id as string);
  }

  const { existingIds, toInsert } = partitionSignals(acc.signals, existingIdByUrl);
  if (existingIds.length) {
    const { error } = await db
      .from("sales_account_signals")
      .update({ discovery_run_id: ctx.runId })
      .in("id", existingIds);
    if (error) throw dbError(error);
  }
  if (!toInsert.length) return existingIds;

  const { data, error } = await db
    .from("sales_account_signals")
    .insert(
      toInsert.map((sig) => ({
        session_id: ctx.sessionId,
        account_id: accountId,
        provider: sig.provider,
        signal_type: sig.signal_type,
        detail: sig.detail,
        source_url: sig.url,
        observed_at: sig.observed_at ?? null,
        captured_at: sig.captured_at,
        confidence: sig.confidence,
        evidence_text: sig.evidence_text,
        discovery_run_id: ctx.runId,
      })),
    )
    .select("id");
  if (error) throw dbError(error, `could not save signals for ${acc.domain}`);
  return [...existingIds, ...(data ?? []).map((s) => s.id as string)];
}

/** One current score per account: replace the latest row, or insert the first. */
async function saveScore(
  db: Db,
  ctx: RunContext,
  accountId: string,
  acc: ResearchedAccount,
  signalIds: string[],
): Promise<void> {
  const { data: existing, error: findError } = await db
    .from("sales_lead_scores")
    .select("id")
    .eq("session_id", ctx.sessionId)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw dbError(findError);

  const row = {
    session_id: ctx.sessionId,
    account_id: accountId,
    model_version: DISCOVERY_SCORE_MODEL,
    factors: {
      fit: acc.score.fit,
      intent: acc.score.intent,
      contactability: acc.score.contactability,
      priority: acc.score.priority,
    },
    explanation: acc.score.explanation,
    evidence_refs: signalIds,
    recommended_tier: acc.tier,
    recommended_channel: primaryChannel(ctx.campaign.allowed_channels),
    discovery_run_id: ctx.runId,
  };
  const { error } = existing
    ? await db.from("sales_lead_scores").update(row).eq("id", existing.id)
    : await db.from("sales_lead_scores").insert(row);
  if (error) throw dbError(error, `could not save the score for ${acc.domain}`);
}

/** Persist an evidenced contact (role/non-buyer inboxes keep their label). */
async function saveFoundContact(
  db: Db,
  ctx: RunContext,
  accountId: string,
  acc: ResearchedAccount,
): Promise<string | null> {
  if (!acc.contact?.email) return null;
  const { data: existing, error: findError } = await db
    .from("sales_contacts")
    .select("id, email, email_verification")
    .eq("session_id", ctx.sessionId)
    .eq("account_id", accountId)
    .limit(1)
    .maybeSingle();
  if (findError) throw dbError(findError);
  // A founder-entered address always wins over what an agent found.
  if (existing?.email_verification === "founder_provided") return existing.email as string;

  const row = foundContactRow({
    sessionId: ctx.sessionId,
    accountId,
    campaignId: ctx.campaign.id as string,
    accountName: acc.name,
    contact: acc.contact,
    at: now(),
  });
  const { error } = existing
    ? await db.from("sales_contacts").update(row).eq("id", existing.id)
    : await db.from("sales_contacts").insert(row);
  if (error) throw dbError(error, `could not save the contact for ${acc.domain}`);
  return acc.contact.email;
}

async function persistAccount(
  db: Db,
  ctx: RunContext,
  acc: ResearchedAccount,
): Promise<DiscoveredAccount> {
  const accountId = await saveAccount(db, ctx, acc);
  const signalIds = await saveSignals(db, ctx, accountId, acc);
  await saveScore(db, ctx, accountId, acc, signalIds);
  const email = await saveFoundContact(db, ctx, accountId, acc);
  return {
    id: accountId,
    name: acc.name,
    domain: acc.domain,
    tier: acc.tier,
    pipeline_stage: "researching",
    signal_count: acc.signals.length,
    segment_key: acc.segment_key,
    email,
  };
}

function logDiscovery(
  sessionId: string,
  output: Record<string, unknown>,
  outputText: string,
): void {
  logAgentRunAsync({
    sessionId,
    source: "pipeline",
    kind: "sales_discover",
    agent: "discovery",
    status: "ok",
    outputJson: output,
    outputText,
  });
}

export async function runDiscovery(db: Db, sessionId: string): Promise<DiscoveryResult> {
  const [{ session }, campaign] = await Promise.all([
    getCampaign(db, sessionId),
    loadSalesCampaign(db, sessionId),
  ]);
  assertSalesActive(session, campaign);
  const segments = confirmedSegments(campaign);
  const planId = await loadApprovedPlanId(db, sessionId);

  const researched = await researchFromSegments({
    offerDomain: session.canonical_domain || session.domain,
    segments,
    exclusions: (campaign.exclusions as string[] | null) ?? [],
    kamiSessionId: sessionId,
  });
  const runId = await startRun(db, sessionId, campaign.id as string, segments, researched);

  // Logged as soon as research completes — persisting can outlive client timeouts.
  logDiscovery(
    sessionId,
    {
      phase: "research_done",
      count: researched.accounts.length,
      warnings: researched.warnings,
      discovery_run_id: runId,
      accounts: researched.accounts.map((a) => ({ name: a.name, domain: a.domain })),
    },
    researched.accounts.map((a) => `${a.name} (${a.domain})`).join("\n") ||
      researched.warnings.join("\n") ||
      "No verifiable companies found",
  );

  if (!researched.accounts.length) {
    return {
      discovered: true,
      count: 0,
      accounts: [],
      discovery_run_id: runId,
      warnings: researched.warnings.length
        ? researched.warnings
        : ["No verifiable companies found — refine your segments and try again."],
    };
  }

  const ctx: RunContext = { sessionId, campaign, runId };
  const created: DiscoveredAccount[] = [];
  for (const acc of researched.accounts) created.push(await persistAccount(db, ctx, acc));

  const { error } = await db
    .from("sales_discovery_runs")
    .update({ accounts_discovered: created.length, warnings: researched.warnings })
    .eq("id", runId);
  if (error) throw dbError(error);

  await audit(db, {
    sessionId,
    actor: "system",
    action: "discovery_completed",
    entityType: "sales_campaign",
    entityId: campaign.id as string,
    payload: {
      accounts_discovered: created.length,
      plan_id: planId,
      discovery_run_id: runId,
      source: "segments_verified_signals",
      warnings: researched.warnings,
    },
  });

  logDiscovery(
    sessionId,
    {
      phase: "completed",
      count: created.length,
      accounts: created,
      warnings: researched.warnings,
      discovery_run_id: runId,
    },
    created.map((a) => `${a.name} (${a.domain})${a.email ? ` · ${a.email}` : ""}`).join("\n"),
  );

  return {
    discovered: true,
    count: created.length,
    accounts: created,
    discovery_run_id: runId,
    warnings: researched.warnings,
  };
}
