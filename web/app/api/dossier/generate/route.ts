import { logAgentRunAsync } from "@/lib/agentRunLog";
import { validateDossier } from "@/lib/dossierValidation";
import type { DomainIdentity } from "@/lib/domainIdentity";
import type { Dossier } from "@/lib/hermes";
import { hermesChatOnce, hermesGatewayConfigured, parseLastJsonBlock } from "@/lib/hermesServer";
import type { ResearchSnapshot } from "@/lib/linkup";
import { onboardingPrompt } from "@/lib/prompts";
import { supabaseServer } from "@/lib/supabase";

export const maxDuration = 300;

function identityFromRow(
  domain: string,
  domainCheck: Record<string, unknown> | null,
): DomainIdentity | null {
  if (!domainCheck || typeof domainCheck.canonical_domain !== "string") return null;
  return {
    input: domain,
    canonical_domain: String(domainCheck.canonical_domain).replace(/^www\./, ""),
    final_url:
      typeof domainCheck.final_url === "string"
        ? domainCheck.final_url
        : `https://${domainCheck.canonical_domain}`,
    company_name: typeof domainCheck.company_name === "string" ? domainCheck.company_name : null,
    title: typeof domainCheck.title === "string" ? domainCheck.title : null,
    description: typeof domainCheck.description === "string" ? domainCheck.description : null,
    h1: typeof domainCheck.h1 === "string" ? domainCheck.h1 : null,
    excerpt: typeof domainCheck.excerpt === "string" ? domainCheck.excerpt : "",
    evidence_url:
      typeof domainCheck.evidence_url === "string"
        ? domainCheck.evidence_url
        : `https://${domainCheck.canonical_domain}`,
    confidence: typeof domainCheck.confidence === "number" ? domainCheck.confidence : 0.7,
    validated_at:
      typeof domainCheck.validated_at === "string"
        ? domainCheck.validated_at
        : new Date().toISOString(),
  };
}

async function persistDossier(
  sessionId: string,
  d: Dossier,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseServer();
  if (!sb) return { ok: false, error: "database not configured" };

  const brandRow = {
    session_id: sessionId,
    company: d.company,
    brand_voice: d.brand_voice,
    positioning: d.positioning,
    competitor_analysis: d.competitor_analysis,
    raw_dossier: d,
  };

  const { data: existing } = await sb
    .from("brand_profiles")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existing) {
    await sb.from("brand_profiles").update(brandRow).eq("id", existing.id);
    await sb.from("icp_buckets").delete().eq("session_id", sessionId);
    await sb.from("opportunities").delete().eq("session_id", sessionId);
  } else {
    const { error } = await sb.from("brand_profiles").insert(brandRow);
    if (error) return { ok: false, error: error.message };
  }

  if (d.icp_buckets?.length) {
    await sb.from("icp_buckets").insert(
      d.icp_buckets.map((b) => ({
        session_id: sessionId,
        label: b.label,
        where_they_live: b.where_they_live,
        trigger_signal: b.trigger_signal,
        est_size: b.est_size,
        angle: b.angle,
      })),
    );
  }
  if (d.opportunities?.length) {
    await sb.from("opportunities").insert(
      d.opportunities.map((o) => ({
        session_id: sessionId,
        title: o.title,
        playbook: o.playbook,
        detail: o.detail,
      })),
    );
  }

  await sb.from("agent_sessions").update({ status: "done" }).eq("id", sessionId);
  logAgentRunAsync({
    sessionId,
    source: "pipeline",
    kind: "dossier_persist",
    agent: "onboarding",
    status: "ok",
    outputJson: d,
    outputText: `${d.company} — ${d.positioning}`,
  });
  return { ok: true };
}

/**
 * Headless dossier generation for E2E harness (and scripts).
 * POST { session_id, goals?, stage?, persist?: boolean }
 */
export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "database not configured" }, { status: 503 });
  if (!hermesGatewayConfigured()) {
    return Response.json(
      { error: "Hermes unavailable — start the local gateway, then retry." },
      { status: 503 },
    );
  }

  const body = await request.json();
  const session_id = body.session_id as string | undefined;
  if (!session_id) {
    return Response.json({ error: "session_id required" }, { status: 400 });
  }
  const persist = body.persist !== false;
  const goals = Array.isArray(body.goals)
    ? body.goals.filter((g: unknown): g is string => typeof g === "string")
    : [];
  const stage = typeof body.stage === "string" ? body.stage : null;

  const { data: session, error } = await sb
    .from("agent_sessions")
    .select(
      "domain, canonical_domain, hermes_session_id, research_snapshot, domain_check, goals_list",
    )
    .eq("id", session_id)
    .maybeSingle();

  if (error || !session) {
    return Response.json({ error: error?.message ?? "session not found" }, { status: 404 });
  }

  const domain = (session.canonical_domain || session.domain || "") as string;
  const domainCheck =
    session.domain_check && typeof session.domain_check === "object"
      ? (session.domain_check as Record<string, unknown>)
      : null;
  const identity = identityFromRow(domain, domainCheck);
  if (!identity) {
    return Response.json(
      {
        error: "session missing domain_check — run /api/domain/validate and persist identity first",
      },
      { status: 400 },
    );
  }

  const snapshot = session.research_snapshot as ResearchSnapshot | null;
  if (!snapshot || typeof snapshot.facts_markdown !== "string") {
    return Response.json(
      { error: "session missing research_snapshot — run /api/research first" },
      { status: 400 },
    );
  }

  const sessionGoals =
    goals.length > 0
      ? goals
      : Array.isArray(session.goals_list)
        ? (session.goals_list as unknown[]).filter((g): g is string => typeof g === "string")
        : [];

  const prompt = onboardingPrompt({
    domain: identity.canonical_domain,
    goals: sessionGoals,
    stage,
    identity,
    researchSnapshot: snapshot,
  });

  const hermesSession =
    typeof session.hermes_session_id === "string"
      ? `kami-dossier-gen-${session.hermes_session_id}`
      : `kami-dossier-gen-${session_id}`;

  const text = await hermesChatOnce({
    content: prompt,
    sessionId: hermesSession,
    kamiSessionId: session_id,
    kind: "dossier_research",
    agent: "onboarding",
    timeoutMs: 240_000,
  });

  if (!text) {
    return Response.json(
      { error: "Hermes returned no dossier — check gateway logs and retry." },
      { status: 502 },
    );
  }

  const parsed = parseLastJsonBlock(text);
  const evidenceText = [
    snapshot.facts_markdown,
    ...(Array.isArray(snapshot.sources)
      ? snapshot.sources.map((s) => `${s.title ?? ""} ${s.excerpt ?? ""}`)
      : []),
  ].join("\n");
  const validated = validateDossier(parsed, identity, evidenceText);
  if (!validated.ok || !validated.dossier) {
    return Response.json(
      {
        error: `Dossier failed validation: ${validated.errors.join("; ")}`,
        raw_preview: text.slice(0, 2000),
      },
      { status: 422 },
    );
  }

  if (persist) {
    const saved = await persistDossier(session_id, validated.dossier);
    if (!saved.ok) {
      return Response.json({ error: saved.error, dossier: validated.dossier }, { status: 500 });
    }
  }

  return Response.json({
    dossier: validated.dossier,
    source: "hermes",
    persisted: persist,
  });
}
