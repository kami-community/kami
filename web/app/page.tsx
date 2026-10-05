"use client";

import { useEffect, useRef, useState } from "react";
import Landing, { type LaunchParams } from "@/components/Landing";
import Dashboard from "@/components/Dashboard";
import { parseActivity, type ActivityEvent } from "@/components/ActivityFeed";
import {
  newSessionId,
  parseDossierRaw,
  streamChat,
  type Dossier as DossierData,
} from "@/lib/hermes";
import { createSession, persist } from "@/lib/persist";
import { onboardingPrompt } from "@/lib/prompts";
import { validateDossier } from "@/lib/dossierValidation";
import type { DomainIdentity } from "@/lib/domainIdentity";
import type { ResearchSnapshot } from "@/lib/linkup";
import type { MarketingConfig } from "@/lib/marketingTypes";
import type { SalesCampaignConfig } from "@/lib/salesTypes";

type View = "landing" | "dashboard";

interface ResumePrompt {
  domain: string;
  dbId: string;
  hermesId: string;
}

export default function Home() {
  const [view, setView] = useState<View>("landing");
  const [domain, setDomain] = useState("");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [dossier, setDossier] = useState<DossierData | null>(null);
  const [marketingConfig, setMarketingConfig] = useState<MarketingConfig | null>(null);
  const [salesConfig, setSalesConfig] = useState<SalesCampaignConfig | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [resumePrompt, setResumePrompt] = useState<ResumePrompt | null>(null);
  const [identityMeta, setIdentityMeta] = useState<{
    company?: string | null;
    confidence?: number;
    evidenceCount?: number;
  } | null>(null);
  const [hermesSessionId, setHermesSessionId] = useState(newSessionId);
  const [sessionDbId, setSessionDbId] = useState<string | null>(null);
  const [sessionGoals, setSessionGoals] = useState<string[]>([]);
  // Refs mirror session ids for async flows that outlive a render.
  const sessionRef = useRef(hermesSessionId);
  const dbIdRef = useRef<string | null>(null);
  const persistedCount = useRef(0);

  function setHermesSession(id: string) {
    sessionRef.current = id;
    setHermesSessionId(id);
  }

  function setDbId(id: string | null) {
    dbIdRef.current = id;
    setSessionDbId(id);
  }

  useEffect(() => {
    const saved = localStorage.getItem("kami_session");
    if (!saved) return;
    try {
      const { dbId, hermesId } = JSON.parse(saved) as { dbId: string; hermesId: string };
      if (!dbId) return;
      fetch(`/api/sessions/${dbId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data?.session) return;
          setResumePrompt({
            domain: data.session.domain,
            dbId,
            hermesId: hermesId || data.session.hermes_session_id,
          });
        })
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }, []);

  async function loadSession(dbId: string, hermesId: string) {
    const data = await fetch(`/api/sessions/${dbId}`).then((r) => (r.ok ? r.json() : null));
    if (!data?.session) return;
    setHermesSession(hermesId);
    setDbId(dbId);
    setDomain(data.session.domain);
    setEvents(
      (data.activity ?? []).map((a: { phase: string; message: string }) => ({
        phase: a.phase ?? "agent",
        message: a.message,
        at: "",
      })),
    );
    persistedCount.current = (data.activity ?? []).length;
    if (data.brand?.raw_dossier) setDossier(data.brand.raw_dossier as DossierData);
    const check = data.session.domain_check;
    if (check?.company_name || check?.confidence) {
      setIdentityMeta({
        company: check.company_name,
        confidence: check.confidence,
        evidenceCount: data.session.research_snapshot?.sources?.length,
      });
    }
    fetch(`/api/marketing/setup?session_id=${dbId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((mc) => {
        if (mc?.config) setMarketingConfig(mc.config as MarketingConfig);
      })
      .catch(() => {});
    fetch(`/api/sales/setup?session_id=${dbId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((sc) => {
        if (sc?.config) setSalesConfig(sc.config as SalesCampaignConfig);
      })
      .catch(() => {});
    setView("dashboard");
    setResumePrompt(null);
  }

  function syncEvents(fullText: string) {
    const parsed = parseActivity(fullText);
    setEvents(parsed);
    for (let i = persistedCount.current; i < parsed.length; i++) {
      persist(dbIdRef.current, "activity", { phase: parsed[i].phase, message: parsed[i].message });
    }
    persistedCount.current = parsed.length;
  }

  async function launch(params: LaunchParams) {
    setLaunchError(null);
    setRunning(true);
    setSessionGoals(params.goals);

    // 1) Validate exact domain BEFORE session / Hermes
    const validateRes = await fetch("/api/domain/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: params.domain }),
    });
    const validateJson = await validateRes.json();
    if (!validateJson.ok || !validateJson.identity) {
      setLaunchError(validateJson.reason ?? "Domain not found");
      setRunning(false);
      setView("landing");
      return;
    }

    const identity = validateJson.identity as DomainIdentity;
    setDomain(identity.canonical_domain);
    setView("dashboard");
    setEvents([]);
    setDossier(null);
    persistedCount.current = 0;
    setHermesSession(newSessionId());
    setIdentityMeta({
      company: identity.company_name,
      confidence: identity.confidence,
      evidenceCount: 1,
    });

    setEvents([
      {
        phase: "research",
        message: `validated ${identity.canonical_domain} · ${identity.company_name ?? "company"} · extracting first-party evidence…`,
        at: "",
      },
    ]);

    // 2) Research + session create
    const researchRes = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity }),
    });
    const researchJson = await researchRes.json();
    if (!researchJson.ok || !researchJson.snapshot) {
      setEvents((e) => [
        ...e,
        {
          phase: "agent",
          message: `⚠ ${researchJson.reason ?? "Research failed"} — fix the domain or retry.`,
          at: "",
        },
      ]);
      setLaunchError(researchJson.reason ?? "Research failed");
      setRunning(false);
      return;
    }

    const snapshot = researchJson.snapshot as ResearchSnapshot;
    setIdentityMeta({
      company: identity.company_name,
      confidence: identity.confidence,
      evidenceCount: snapshot.sources?.length ?? 1,
    });

    const dbId = await createSession({
      hermesSessionId: sessionRef.current,
      domain: identity.canonical_domain,
      goals: params.goals,
      stage: params.stage,
      canonical_domain: identity.canonical_domain,
      domain_validated_at: identity.validated_at,
      domain_check: identity as unknown as Record<string, unknown>,
      research_snapshot: snapshot as unknown as Record<string, unknown>,
    });
    setDbId(dbId);
    if (dbId) {
      localStorage.setItem("kami_session", JSON.stringify({ dbId, hermesId: sessionRef.current }));
    }

    setEvents((e) => [
      ...e,
      {
        phase: "research",
        message: `research ready · ${snapshot.sources.length} sources (${snapshot.sources.filter((s) => s.source_class === "first_party").length} first-party)`,
        at: "",
      },
    ]);

    let full = "";
    try {
      full = await streamChat(
        onboardingPrompt({
          domain: identity.canonical_domain,
          goals: params.goals,
          stage: params.stage,
          identity,
          researchSnapshot: snapshot,
        }),
        sessionRef.current,
        (delta) => {
          full += delta;
          syncEvents(full);
        },
        {
          kamiSessionId: dbIdRef.current,
          kind: "dossier_research",
          agent: "onboarding",
        },
      );

      const raw = parseDossierRaw(full);
      const evidenceText = [
        snapshot.facts_markdown,
        ...(snapshot.sources ?? []).map((s) => `${s.title ?? ""} ${s.excerpt ?? ""}`),
      ].join("\n");
      const validated = validateDossier(raw, identity, evidenceText);
      if (validated.ok && validated.dossier) {
        setDossier(validated.dossier);
        persist(
          dbIdRef.current,
          "dossier",
          validated.dossier as unknown as Record<string, unknown>,
        );
      } else {
        setDossier(null);
        persist(dbIdRef.current, "status", { status: "failed" });
        setEvents((e) => [
          ...e,
          {
            phase: "agent",
            message: `⚠ dossier rejected — ${validated.errors.slice(0, 3).join("; ") || "invalid"}. Retry research.`,
            at: "",
          },
        ]);
      }
      persist(dbIdRef.current, "message", { role: "assistant", content: full });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "request failed";
      setEvents((e) => [...e, { phase: "agent", message: `⚠ ${msg}`, at: "" }]);
      persist(dbIdRef.current, "status", { status: "failed" });
    } finally {
      setRunning(false);
    }
  }

  function newCampaign() {
    localStorage.removeItem("kami_session");
    setView("landing");
    setDomain("");
    setEvents([]);
    setDossier(null);
    setMarketingConfig(null);
    setSalesConfig(null);
    setIdentityMeta(null);
    setLaunchError(null);
    setResumePrompt(null);
    setDbId(null);
    setSessionGoals([]);
    persistedCount.current = 0;
    setHermesSession(newSessionId());
  }

  return (
    <main className={view === "landing" ? "container" : "container-wide"}>
      {view === "landing" ? (
        <Landing
          onLaunch={launch}
          busy={running}
          error={launchError}
          resumePrompt={resumePrompt}
          onResume={() => resumePrompt && loadSession(resumePrompt.dbId, resumePrompt.hermesId)}
          onDismissResume={() => {
            localStorage.removeItem("kami_session");
            setResumePrompt(null);
          }}
        />
      ) : (
        <Dashboard
          domain={domain}
          events={events}
          running={running}
          dossier={dossier}
          sessionId={hermesSessionId}
          sessionDbId={sessionDbId}
          marketingConfig={marketingConfig}
          salesConfig={salesConfig}
          identityMeta={identityMeta}
          sessionGoals={sessionGoals}
          onNewCampaign={newCampaign}
          onMarketingSetup={setMarketingConfig}
          onSalesSetup={setSalesConfig}
          onDossierUpdated={setDossier}
        />
      )}
    </main>
  );
}
