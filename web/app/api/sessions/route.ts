import { logAgentRunAsync } from "@/lib/agentRunLog";
import { supabaseServer } from "@/lib/supabase";
import { claimAccountsForSession } from "@/lib/claimAccounts";
import { readClaimId } from "@/lib/claimCookie";

// Create a session row. Returns { id } or { id: null } when Supabase is unconfigured.
// Persists domain-truth identity fields when provided; claims connected X/IG accounts (kami_claim cookie).
export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ id: null, persisted: false });

  const body = await request.json();
  const {
    hermesSessionId,
    domain,
    goals,
    stage,
    canonical_domain,
    domain_validated_at,
    domain_check,
    research_snapshot,
  } = body;

  if (!hermesSessionId || !domain) {
    return Response.json({ error: "hermesSessionId and domain required" }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    hermes_session_id: hermesSessionId,
    domain,
    goals: goals ?? [],
    stage: stage ?? null,
  };
  if (canonical_domain) row.canonical_domain = canonical_domain;
  if (domain_validated_at) row.domain_validated_at = domain_validated_at;
  if (domain_check) row.domain_check = domain_check;
  if (research_snapshot) row.research_snapshot = research_snapshot;

  const { data, error } = await sb.from("agent_sessions").insert(row).select("id").single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const claimId = readClaimId(request);
  const claimed = await claimAccountsForSession(sb, data.id, claimId);

  // Session-linked breadcrumbs for steps that ran before we had a session id
  if (domain_check && typeof domain_check === "object") {
    const dc = domain_check as Record<string, unknown>;
    logAgentRunAsync({
      sessionId: data.id,
      hermesSessionId: typeof hermesSessionId === "string" ? hermesSessionId : undefined,
      source: "pipeline",
      kind: "domain_validate",
      agent: "onboarding",
      status: "ok",
      outputJson: domain_check,
      outputText: String(dc.canonical_domain ?? domain),
    });
  }
  if (research_snapshot && typeof research_snapshot === "object") {
    const snap = research_snapshot as Record<string, unknown>;
    logAgentRunAsync({
      sessionId: data.id,
      hermesSessionId: typeof hermesSessionId === "string" ? hermesSessionId : undefined,
      source: "pipeline",
      kind: "research",
      agent: "onboarding",
      status: "ok",
      outputJson: {
        source: snap.source ?? null,
        facts_len: typeof snap.facts_markdown === "string" ? snap.facts_markdown.length : 0,
      },
      outputText:
        typeof snap.facts_markdown === "string"
          ? snap.facts_markdown.slice(0, 500)
          : "research_snapshot",
    });
  }

  return Response.json({ id: data.id, persisted: true, accounts_claimed: claimed });
}
