import { validateDossier } from "@/lib/dossierValidation";
import type { DomainIdentity } from "@/lib/domainIdentity";
import type { Dossier } from "@/lib/hermes";
import { hermesChatOnce, hermesGatewayConfigured, parseLastJsonBlock } from "@/lib/hermesServer";
import { dossierRevisePrompt } from "@/lib/prompts";
import { supabaseServer } from "@/lib/supabase";

function identityFromSession(
  domain: string,
  domainCheck: Record<string, unknown> | null,
  dossier: Dossier | null,
): DomainIdentity {
  const canonical =
    (typeof domainCheck?.canonical_domain === "string" && domainCheck.canonical_domain) ||
    dossier?.canonical_domain ||
    domain;
  return {
    input: domain,
    canonical_domain: canonical.replace(/^www\./, ""),
    final_url:
      (typeof domainCheck?.final_url === "string" && domainCheck.final_url) ||
      `https://${canonical}`,
    company_name: dossier?.company ?? null,
    title: null,
    description: null,
    h1: null,
    excerpt:
      typeof domainCheck?.excerpt === "string"
        ? domainCheck.excerpt
        : dossier?.positioning?.slice(0, 400) || "",
    evidence_url:
      dossier?.evidence_urls?.[0] ||
      (typeof domainCheck?.evidence_url === "string" && domainCheck.evidence_url) ||
      `https://${canonical}`,
    confidence:
      typeof domainCheck?.confidence === "number"
        ? domainCheck.confidence
        : typeof dossier?.identity_confidence === "number"
          ? dossier.identity_confidence
          : 0.7,
    validated_at:
      (typeof domainCheck?.validated_at === "string" && domainCheck.validated_at) ||
      new Date().toISOString(),
  };
}

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "database not configured" }, { status: 503 });
  if (!hermesGatewayConfigured()) {
    return Response.json(
      { error: "Hermes unavailable — start the local gateway, then try Regenerate again." },
      { status: 503 },
    );
  }

  const body = await request.json();
  const session_id = body.session_id as string | undefined;
  const correction = typeof body.correction === "string" ? body.correction.trim() : "";
  if (!session_id || !correction) {
    return Response.json({ error: "session_id and correction required" }, { status: 400 });
  }

  const [sessionRes, brandRes] = await Promise.all([
    sb
      .from("agent_sessions")
      .select("domain, canonical_domain, hermes_session_id, research_snapshot, domain_check")
      .eq("id", session_id)
      .maybeSingle(),
    sb.from("brand_profiles").select("raw_dossier").eq("session_id", session_id).maybeSingle(),
  ]);

  const session = sessionRes.data;
  if (!session) return Response.json({ error: "session not found" }, { status: 404 });

  const domain = (session.canonical_domain || session.domain || "") as string;
  const current =
    (body.dossier as Dossier | undefined) || (brandRes.data?.raw_dossier as Dossier | null) || null;
  if (!current) {
    return Response.json({ error: "no dossier to revise" }, { status: 400 });
  }

  const domainCheck =
    session.domain_check && typeof session.domain_check === "object"
      ? (session.domain_check as Record<string, unknown>)
      : null;
  const identity = identityFromSession(domain, domainCheck, current);

  const researchMarkdown =
    session.research_snapshot &&
    typeof session.research_snapshot === "object" &&
    typeof (session.research_snapshot as { facts_markdown?: unknown }).facts_markdown === "string"
      ? (session.research_snapshot as { facts_markdown: string }).facts_markdown.slice(0, 6000)
      : undefined;

  const prompt = dossierRevisePrompt({
    canonicalDomain: identity.canonical_domain,
    correction,
    currentDossierJson: JSON.stringify(current, null, 2),
    researchMarkdown,
  });

  const hermesSession =
    typeof session.hermes_session_id === "string"
      ? `kami-dossier-revise-${session.hermes_session_id}`
      : `kami-dossier-revise-${session_id}`;

  const text = await hermesChatOnce({
    content: prompt,
    sessionId: hermesSession,
    kamiSessionId: session_id,
    kind: "dossier_revise",
    agent: "dossier_reviser",
    timeoutMs: 120_000,
    meta: { correction: correction.slice(0, 500) },
  });
  if (!text) {
    return Response.json(
      { error: "Hermes returned no revision — keep the current dossier and try again." },
      { status: 502 },
    );
  }

  const parsed = parseLastJsonBlock(text);
  const validated = validateDossier(parsed, identity, researchMarkdown);
  if (!validated.ok || !validated.dossier) {
    return Response.json(
      {
        error: `Revised dossier failed validation: ${validated.errors.join("; ")}`,
      },
      { status: 422 },
    );
  }

  const d = validated.dossier;
  const brandRow = {
    session_id,
    company: d.company,
    brand_voice: d.brand_voice,
    positioning: d.positioning,
    competitor_analysis: d.competitor_analysis,
    raw_dossier: d,
  };

  const { data: existing } = await sb
    .from("brand_profiles")
    .select("id")
    .eq("session_id", session_id)
    .maybeSingle();

  if (existing) {
    await sb.from("brand_profiles").update(brandRow).eq("id", existing.id);
    await sb.from("icp_buckets").delete().eq("session_id", session_id);
    await sb.from("opportunities").delete().eq("session_id", session_id);
  } else {
    await sb.from("brand_profiles").insert(brandRow);
  }

  if (d.icp_buckets?.length) {
    await sb.from("icp_buckets").insert(
      d.icp_buckets.map((b) => ({
        session_id,
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
        session_id,
        title: o.title,
        playbook: o.playbook,
        detail: o.detail,
      })),
    );
  }

  await sb.from("activity_events").insert({
    session_id,
    phase: "dossier",
    message: `Dossier regenerated from founder correction: ${correction.slice(0, 120)}`,
  });

  return Response.json({ dossier: d, source: "hermes" });
}
