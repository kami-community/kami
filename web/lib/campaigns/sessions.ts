import { logAgentRunAsync } from "@/lib/agentRunLog";
import { DossierSchema, type Dossier } from "@/lib/domain/dossier";
import type { DomainIdentity, ResearchSnapshot } from "@/lib/domain/research";
import type { Db } from "@/lib/db/client";
import { validateDomainIdentity } from "@/lib/domainIdentity";
import { AppError, badRequest, notFound } from "@/lib/http/errors";
import { researchDomainIdentity } from "@/lib/campaigns/research";

/** Campaign sessions: one per founder company, created from a validated domain. */

export interface CampaignSession {
  id: string;
  domain: string;
  canonical_domain: string;
  goals: string[];
  stage: string | null;
  status: string;
  paused: boolean;
  dossier_confirmed_at: string | null;
  domain_check: DomainIdentity;
  research_snapshot: ResearchSnapshot;
  created_at: string;
}

export interface CampaignView {
  session: CampaignSession;
  dossier: Dossier | null;
}

const SESSION_COLUMNS =
  "id, domain, canonical_domain, goals, stage, status, paused, dossier_confirmed_at, domain_check, research_snapshot, created_at";

/** Validate the founder's own domain, research it, and open a campaign session. */
export async function createCampaign(
  db: Db,
  input: { domain: string; goals: string[]; stage: string | null },
): Promise<CampaignSession> {
  const validated = await validateDomainIdentity(input.domain);
  if (!validated.ok) {
    throw badRequest(validated.reason, { detail: validated.detail ?? null });
  }
  const identity = validated.identity;

  const research = await researchDomainIdentity(identity);
  if (!research.ok) throw new AppError("upstream_failed", research.reason);

  const { data, error } = await db
    .from("agent_sessions")
    .insert({
      domain: identity.canonical_domain,
      canonical_domain: identity.canonical_domain,
      goals: input.goals,
      stage: input.stage,
      status: "researched",
      domain_validated_at: identity.validated_at,
      domain_check: identity,
      research_snapshot: research.snapshot,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw new AppError("internal", `could not create the campaign: ${error.message}`);

  logAgentRunAsync({
    sessionId: data.id,
    source: "pipeline",
    kind: "research",
    agent: "brand-analyst",
    status: "ok",
    outputText: research.snapshot.facts_markdown.slice(0, 2000),
    outputJson: { sources: research.snapshot.sources.length },
  });
  return data as CampaignSession;
}

export async function loadSession(db: Db, sessionId: string): Promise<CampaignSession> {
  const { data, error } = await db
    .from("agent_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data) throw notFound("campaign not found");
  return data as CampaignSession;
}

export interface CampaignSummary {
  id: string;
  canonical_domain: string;
  company_name: string | null;
  dossier_confirmed_at: string | null;
  created_at: string;
}

/** Every campaign on this install, newest first (the workspace switcher). */
export async function listCampaigns(db: Db): Promise<CampaignSummary[]> {
  const { data, error } = await db
    .from("agent_sessions")
    .select("id, canonical_domain, domain_check, dossier_confirmed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new AppError("internal", error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    canonical_domain: row.canonical_domain as string,
    company_name: (row.domain_check as DomainIdentity | null)?.company_name ?? null,
    dossier_confirmed_at: row.dossier_confirmed_at as string | null,
    created_at: row.created_at as string,
  }));
}

/** The stored dossier, or null when it is missing or predates the current schema. */
export async function loadDossier(db: Db, sessionId: string): Promise<Dossier | null> {
  const { data, error } = await db
    .from("brand_profiles")
    .select("raw_dossier")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  const parsed = DossierSchema.safeParse(data?.raw_dossier);
  return parsed.success ? parsed.data : null;
}

export async function getCampaign(db: Db, sessionId: string): Promise<CampaignView> {
  const [session, dossier] = await Promise.all([
    loadSession(db, sessionId),
    loadDossier(db, sessionId),
  ]);
  return { session, dossier };
}

/** "That's us" — required before Sales or Marketing setup. */
export async function confirmDossier(db: Db, sessionId: string): Promise<string> {
  if (!(await loadDossier(db, sessionId))) throw badRequest("there is no dossier to confirm yet");
  const confirmedAt = new Date().toISOString();
  const { error } = await db
    .from("agent_sessions")
    .update({ dossier_confirmed_at: confirmedAt })
    .eq("id", sessionId);
  if (error) throw new AppError("internal", error.message);
  return confirmedAt;
}

/** Guard for GTM setup steps: the founder must confirm the dossier first (domain-first). */
export async function assertDossierConfirmed(db: Db, sessionId: string): Promise<void> {
  const session = await loadSession(db, sessionId);
  if (!session.dossier_confirmed_at) {
    throw new AppError(
      "forbidden",
      "confirm the company dossier (That's us) before setting up campaigns",
    );
  }
}
