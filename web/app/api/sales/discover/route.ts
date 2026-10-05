import { logAgentRunAsync } from "@/lib/agentRunLog";
import { supabaseServer } from "@/lib/supabase";
import { researchFromSegments } from "@/lib/salesResearch";
import type { SalesSegment } from "@/lib/domain/segments";
import { normalizeSegments } from "@/lib/domain/segments";

/** Discover + contact find can exceed default ~300s; keep the route alive for E2E/local. */
export const maxDuration = 600;

export async function POST(request: Request): Promise<Response> {
  try {
    return await postDiscover(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sales/discover]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

async function postDiscover(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { session_id } = await request.json();
  if (!session_id) {
    return Response.json({ error: "session_id required" }, { status: 400 });
  }

  const { data: campaign, error: campErr } = await sb
    .from("sales_campaigns")
    .select("*")
    .eq("session_id", session_id)
    .maybeSingle();

  if (campErr) return Response.json({ error: campErr.message }, { status: 500 });
  if (!campaign) {
    return Response.json({ error: "no sales campaign found — run setup first" }, { status: 404 });
  }

  if (campaign.autonomous_paused) {
    return Response.json(
      { error: "sales autonomous actions are paused for this session", paused: true },
      { status: 423 },
    );
  }

  if (
    !campaign.segments_confirmed_at ||
    !Array.isArray(campaign.segments) ||
    !campaign.segments.length
  ) {
    return Response.json(
      {
        error:
          "ICP segments not confirmed yet — confirm who you're selling to before finding companies",
      },
      { status: 400 },
    );
  }

  const { data: approvedPlan } = await sb
    .from("sales_plans")
    .select("id, status")
    .eq("session_id", session_id)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!approvedPlan) {
    return Response.json(
      { error: "no approved sales plan — approve the plan before running discovery" },
      { status: 400 },
    );
  }

  const { data: session, error: sessErr } = await sb
    .from("agent_sessions")
    .select("domain, canonical_domain")
    .eq("id", session_id)
    .maybeSingle();

  if (sessErr) return Response.json({ error: sessErr.message }, { status: 500 });
  const offerDomain = session?.canonical_domain || session?.domain;
  if (!offerDomain) {
    return Response.json({ error: "session domain not found" }, { status: 400 });
  }

  const segments = normalizeSegments({ segments: campaign.segments }) as SalesSegment[];
  const researched = await researchFromSegments({
    offerDomain,
    segments,
    exclusions: campaign.exclusions ?? [],
    kamiSessionId: session_id,
  });

  // Traceable discovery run — re-runs attach signals/scores to this id (dedupe below).
  const { data: runRow, error: runErr } = await sb
    .from("sales_discovery_runs")
    .insert({
      session_id,
      sales_campaign_id: campaign.id,
      segment_snapshot: segments,
      warnings: researched.warnings,
      accounts_discovered: researched.accounts.length,
    })
    .select("id")
    .single();

  if (runErr) {
    // Migration 006 may not be applied — continue without run id but surface warning
    researched.warnings.push(
      `sales_discovery_runs unavailable — apply 008_domain_truth.sql (${runErr.message})`,
    );
  }
  const discoveryRunId = runRow?.id as string | undefined;

  // Log as soon as research completes — contact-find can outlive client timeouts
  logAgentRunAsync({
    sessionId: session_id,
    source: "pipeline",
    kind: "sales_discover",
    agent: "discovery",
    status: "ok",
    outputJson: {
      phase: "research_done",
      count: researched.accounts.length,
      warnings: researched.warnings,
      discovery_run_id: discoveryRunId ?? null,
      accounts: researched.accounts.map((a) => ({
        name: a.name,
        domain: a.domain,
      })),
    },
    outputText:
      researched.accounts.map((a) => `${a.name} (${a.domain})`).join("\n") ||
      researched.warnings.join("\n") ||
      "No verifiable companies found",
  });

  if (!researched.accounts.length) {
    return Response.json({
      discovered: true,
      count: 0,
      accounts: [],
      discovery_run_id: discoveryRunId ?? null,
      warnings: researched.warnings.length
        ? researched.warnings
        : ["No verifiable companies found — refine your segments and try again."],
    });
  }

  const created: {
    id: string;
    name: string;
    domain: string;
    tier: number;
    pipeline_stage: string;
    signal_count: number;
    segment_key?: string;
    email?: string | null;
  }[] = [];

  for (const acc of researched.accounts) {
    const row = {
      session_id,
      sales_campaign_id: campaign.id,
      name: acc.name,
      domain: acc.domain,
      industry: acc.industry ?? null,
      geo: acc.geo ?? null,
      pipeline_stage: "researching",
      tier: acc.tier,
      segment_key: acc.segment_key ?? null,
      notes: acc.notes ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await sb
      .from("sales_accounts")
      .select("id")
      .eq("session_id", session_id)
      .eq("domain", acc.domain)
      .maybeSingle();

    let accountId: string;
    if (existing) {
      const { data, error } = await sb
        .from("sales_accounts")
        .update(row)
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      accountId = data.id;
    } else {
      const { data, error } = await sb.from("sales_accounts").insert(row).select("id").single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      accountId = data.id;
    }

    const signalIds: string[] = [];
    if (acc.signals.length) {
      for (const sig of acc.signals) {
        // Dedupe by account + source_url within session
        if (sig.url) {
          const { data: existingSig } = await sb
            .from("sales_account_signals")
            .select("id")
            .eq("account_id", accountId)
            .eq("source_url", sig.url)
            .maybeSingle();
          if (existingSig) {
            signalIds.push(existingSig.id);
            if (discoveryRunId) {
              await sb
                .from("sales_account_signals")
                .update({ discovery_run_id: discoveryRunId })
                .eq("id", existingSig.id);
            }
            continue;
          }
        }

        const signalRow: Record<string, unknown> = {
          session_id,
          account_id: accountId,
          provider: sig.provider,
          signal_type: sig.signal_type,
          detail: sig.detail,
          source_url: sig.url,
          observed_at: sig.observed_at ?? null,
          captured_at: sig.captured_at,
          confidence: sig.confidence,
          evidence_text: sig.evidence_text,
        };
        if (discoveryRunId) signalRow.discovery_run_id = discoveryRunId;

        const { data: insertedSignal, error: sigErr } = await sb
          .from("sales_account_signals")
          .insert(signalRow)
          .select("id")
          .single();
        if (sigErr) return Response.json({ error: sigErr.message }, { status: 500 });
        if (insertedSignal) signalIds.push(insertedSignal.id);
      }
    }

    // Upsert latest score for this account (one current row per discover pass — replace prior)
    const { data: existingScore } = await sb
      .from("sales_lead_scores")
      .select("id")
      .eq("account_id", accountId)
      .eq("session_id", session_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const scoreRow: Record<string, unknown> = {
      session_id,
      account_id: accountId,
      model_version: "v3-fit-intent-signals",
      factors: {
        fit: acc.score.fit,
        intent: acc.score.intent,
        contactability: acc.score.contactability,
        priority: acc.score.priority,
      },
      explanation: acc.score.explanation,
      evidence_refs: signalIds,
      recommended_tier: acc.tier,
      recommended_channel: (campaign.allowed_channels ?? ["email"])[0] ?? "email",
    };
    if (discoveryRunId) scoreRow.discovery_run_id = discoveryRunId;

    if (existingScore) {
      await sb.from("sales_lead_scores").update(scoreRow).eq("id", existingScore.id);
    } else {
      await sb.from("sales_lead_scores").insert(scoreRow);
    }

    let email: string | null = null;
    if (acc.contact?.email) {
      email = acc.contact.email;
      // Persist truth: role/non-buyer stay visible but are not sequence-eligible.
      // Never map role_inbox → safe_to_send.
      const verification =
        acc.contact.verification_status === "role_inbox"
          ? "role_inbox"
          : acc.contact.verification_status === "non_buyer_inbox"
            ? "non_buyer_inbox"
            : acc.contact.verification_status === "verified_public" ||
                acc.contact.verification_status === "hermes_evidence" ||
                acc.contact.verification_status === "valid"
              ? "valid"
              : "unknown";

      const { data: existingContact } = await sb
        .from("sales_contacts")
        .select("id")
        .eq("account_id", accountId)
        .eq("session_id", session_id)
        .maybeSingle();

      const contactRow = {
        session_id,
        account_id: accountId,
        sales_campaign_id: campaign.id,
        name: acc.contact.name ?? acc.name,
        title: acc.contact.title ?? null,
        email,
        email_verification: verification,
        do_not_contact: false,
        updated_at: new Date().toISOString(),
      };

      if (existingContact) {
        await sb.from("sales_contacts").update(contactRow).eq("id", existingContact.id);
      } else {
        await sb.from("sales_contacts").insert(contactRow);
      }
    }

    created.push({
      id: accountId,
      name: acc.name,
      domain: acc.domain,
      tier: acc.tier,
      pipeline_stage: "researching",
      signal_count: acc.signals.length,
      segment_key: acc.segment_key,
      email,
    });
  }

  if (discoveryRunId) {
    await sb
      .from("sales_discovery_runs")
      .update({ accounts_discovered: created.length, warnings: researched.warnings })
      .eq("id", discoveryRunId);
  }

  await sb.from("sales_audit_events").insert({
    session_id,
    actor: "system",
    action: "discovery_completed",
    entity_type: "sales_campaign",
    entity_id: campaign.id,
    payload: {
      accounts_discovered: created.length,
      plan_id: approvedPlan.id,
      discovery_run_id: discoveryRunId ?? null,
      source: "segments_verified_signals",
      warnings: researched.warnings,
    },
  });

  logAgentRunAsync({
    sessionId: session_id,
    source: "pipeline",
    kind: "sales_discover",
    agent: "discovery",
    status: "ok",
    outputJson: {
      phase: "completed",
      count: created.length,
      accounts: created,
      warnings: researched.warnings,
      discovery_run_id: discoveryRunId ?? null,
    },
    outputText: created
      .map((a) => `${a.name} (${a.domain})${a.email ? ` · ${a.email}` : ""}`)
      .join("\n"),
  });

  return Response.json({
    discovered: true,
    count: created.length,
    accounts: created,
    discovery_run_id: discoveryRunId ?? null,
    warnings: researched.warnings,
  });
}
