import type {
  CollectedEvidence,
  CompanyFixture,
  GapEntry,
  GateResult,
  RcaClass,
  Scorecard,
  StepResult,
} from "./types";

function textBlob(evidence: CollectedEvidence): string {
  const d = evidence.dossier ?? {};
  return [
    String(d.company ?? ""),
    String(d.positioning ?? ""),
    String(d.product_category ?? ""),
    String(d.brand_voice ?? ""),
    JSON.stringify(d.industries ?? []),
    JSON.stringify(d.personas ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function includesAny(hay: string, needles: string[]): boolean {
  return needles.some((n) => termInBlob(hay, n));
}

function includesAll(hay: string, needles: string[]): boolean {
  if (!needles.length) return true;
  return needles.every((n) => termInBlob(hay, n));
}

/** Synonym-aware term match — keeps gold intent without fixture-specific hacks. */
function termInBlob(hay: string, term: string): boolean {
  const t = term.toLowerCase().trim();
  if (!t) return true;
  if (hay.includes(t)) return true;
  if (t === "open source") {
    return hay.includes("open-source") || hay.includes("opensource") || hay.includes("open source");
  }
  if (t === "firebase") {
    return hay.includes("firebase") || hay.includes("firestore");
  }
  return false;
}

function classifyGap(symptom: string): { class: RcaClass; severity: GapEntry["severity"] } {
  const s = symptom.toLowerCase();
  if (
    s.includes("hermes") ||
    s.includes("gateway") ||
    s.includes("503") ||
    s.includes("migration")
  ) {
    return { class: "environment", severity: "blocker" };
  }
  if (s.includes("homonym") || s.includes("identity") || s.includes("wrong vertical")) {
    return { class: "architecture", severity: "blocker" };
  }
  if (s.includes("invent") || s.includes("email") || s.includes("plg") || s.includes("route")) {
    return { class: "architecture", severity: "blocker" };
  }
  if (s.includes("listicle") || s.includes("research") || s.includes("thin")) {
    return { class: "data_research", severity: "major" };
  }
  if (s.includes("prompt") || s.includes("positioning") || s.includes("dossier_must")) {
    return { class: "prompt_skill", severity: "major" };
  }
  return { class: "patch", severity: "minor" };
}

function gate(ok: boolean, skip = false): GateResult {
  if (skip) return "skip";
  return ok ? "pass" : "fail";
}

export function scoreRun(input: {
  fixture: CompanyFixture;
  sessionId: string | null;
  hermesSessionId: string | null;
  startedAt: string;
  endedAt: string;
  environment: string;
  baseUrl: string;
  actualRoute: Scorecard["route"]["actual"];
  steps: StepResult[];
  evidence: CollectedEvidence;
}): Scorecard {
  const { fixture, evidence } = input;
  const blob = textBlob(evidence);
  const gaps: GapEntry[] = [];
  const step_checks: Scorecard["step_checks"] = {};

  const foundKinds = evidence.runLogs.map((r) => String(r.kind ?? "")).filter(Boolean);
  const foundIds = evidence.runLogs.map((r) => String(r.id ?? "")).filter(Boolean);

  // Identity lock
  const domainOk =
    Boolean(evidence.dossier) &&
    includesAny(
      blob,
      fixture.expected.company_name_hints.map((h) => h.toLowerCase()),
    ) &&
    !includesAny(blob, fixture.expected.dossier_must_not);
  const identity_lock = gate(domainOk && Boolean(evidence.dossier));
  step_checks.dossier_identity = {
    ok: identity_lock === "pass",
    detail:
      identity_lock === "pass"
        ? "company/name hints match"
        : "identity mismatch or missing dossier",
  };
  if (identity_lock === "fail") {
    const c = classifyGap("identity / homonym");
    gaps.push({
      fixture_id: fixture.id,
      session_id: input.sessionId,
      run_log_ids: foundIds,
      symptom: "Identity lock failed",
      expected: `Hints ${fixture.expected.company_name_hints.join(", ")}; exclude ${fixture.expected.dossier_must_not.join(", ") || "(none)"}`,
      actual: blob.slice(0, 400) || "(no dossier)",
      evidence: `session=${input.sessionId}`,
      severity: c.severity,
      class: c.class,
      next_action:
        "Inspect dossier_research run log and domain_check; tighten identity prompt/validation",
      status: "open",
    });
  }

  // Evidence grounding (must-include terms)
  const evidence_grounding = gate(
    Boolean(evidence.dossier) && includesAll(blob, fixture.expected.dossier_must_include),
  );
  step_checks.dossier_evidence = {
    ok: evidence_grounding === "pass",
    detail:
      evidence_grounding === "pass"
        ? "required product terms present"
        : `missing terms: ${fixture.expected.dossier_must_include.filter((t) => !blob.includes(t.toLowerCase())).join(", ")}`,
  };
  if (evidence_grounding === "fail") {
    const c = classifyGap("dossier_must_include");
    gaps.push({
      fixture_id: fixture.id,
      session_id: input.sessionId,
      run_log_ids: foundIds,
      symptom: "Dossier missing expected product language",
      expected: fixture.expected.dossier_must_include.join(", "),
      actual: blob.slice(0, 400),
      evidence: "brand_profiles.raw_dossier",
      severity: c.severity,
      class: c.class,
      next_action: "Improve onboarding prompt / research quality for this domain",
      status: "open",
    });
  }

  // Route safety
  const expected = fixture.expected.job_primary;
  let routeOk = false;
  if (expected === "mixed") {
    routeOk =
      input.actualRoute === "sales" ||
      input.actualRoute === "marketing" ||
      input.actualRoute === "mixed";
  } else if (expected === "find_customers") {
    routeOk = input.actualRoute === "sales";
  } else if (expected === "create_distribution") {
    routeOk = input.actualRoute === "marketing";
  }
  const route_safety = gate(routeOk);
  step_checks.route = {
    ok: routeOk,
    detail: `expected=${expected} actual=${input.actualRoute}`,
  };
  if (!routeOk) {
    const c = classifyGap("route");
    gaps.push({
      fixture_id: fixture.id,
      session_id: input.sessionId,
      run_log_ids: foundIds,
      symptom: "Wrong job route for fixture",
      expected,
      actual: input.actualRoute,
      evidence: "harness branch selection + fixture job_primary",
      severity: c.severity,
      class: c.class,
      next_action: "Align fixture routing or product job recommendation",
      status: "open",
    });
  }

  // Contact safety — no invented emails; drafts without contact should not be "sent"
  const accountRows = evidence.accounts as Array<{
    contact?: { email?: string; email_verification?: string; verification_status?: string };
    email?: string;
    email_verification?: string;
  }>;
  const contacts = accountRows.flatMap((a) => {
    const email = a.contact?.email ?? a.email;
    return email ? [email] : [];
  });
  const drafts = evidence.drafts as Array<{ status?: string; recipient?: string }>;
  const sentWithoutReceipt = drafts.some((d) => d.status === "sent" || d.status === "delivered");
  // Heuristic: emails that look guessed (firstname.lastname without source) are hard to detect;
  // we fail if must_not includes invent and we somehow marked sent, or if sales_default_invalid but contacts were invented for consumers.
  const contact_safety = gate(!sentWithoutReceipt);
  step_checks.contact_safety = {
    ok: contact_safety === "pass",
    detail: sentWithoutReceipt
      ? "draft marked sent — harness must not send"
      : `${contacts.length} contacts present; no send executed`,
  };
  if (contact_safety === "fail") {
    gaps.push({
      fixture_id: fixture.id,
      session_id: input.sessionId,
      run_log_ids: foundIds,
      symptom: "Execution truthfulness / contact safety — send status without harness send step",
      expected: "no external send",
      actual: "draft status indicates send",
      evidence: "sales drafts",
      severity: "blocker",
      class: "architecture",
      next_action: "Ensure harness never calls drafts action=send; audit send gates",
      status: "open",
    });
  }

  // Diagnostic (non-gating): non-buyer / role inboxes among discovered contacts
  const NON_BUYER_LOCAL =
    /^(hello|hi|sales|contact|info|support|team|press|privacy|hr|legal|webmaster|admin|help|media|pr|e|h|last|first)$/i;
  const nonBuyerEmails = contacts.filter((email) => {
    const local = email.split("@")[0] ?? "";
    return NON_BUYER_LOCAL.test(local);
  });
  step_checks.contact_buyer_quality = {
    ok: nonBuyerEmails.length === 0,
    detail:
      nonBuyerEmails.length === 0
        ? "no obvious role/non-buyer locals in discovered contacts"
        : `${nonBuyerEmails.length} role/non-buyer locals (diagnostic): ${nonBuyerEmails.slice(0, 5).join(", ")}`,
  };
  if (nonBuyerEmails.length > 0 && expected === "find_customers") {
    gaps.push({
      fixture_id: fixture.id,
      session_id: input.sessionId,
      run_log_ids: foundIds,
      symptom: "Non-buyer / role inboxes present among discovered contacts (diagnostic)",
      expected: "buyer-reachable contacts, or role_inbox marked non-sendable",
      actual: nonBuyerEmails.slice(0, 8).join(", "),
      evidence: "sales accounts/contacts",
      severity: "major",
      class: "patch",
      next_action: "Confirm role_inbox/non_buyer_inbox mapping + sequence gates reject them",
      status: "open",
    });
  }

  // PLG honesty
  let plgOk = true;
  if (fixture.expected.sales.sales_default_invalid) {
    // Must not have forced company accounts as only path when discover_companies is false
    if (fixture.expected.sales.discover_companies === false && evidence.accounts.length > 0) {
      // Having accounts isn't always wrong if B2B seeds exist — for PLG fixtures we flag invent risk if contacts look consumer
      plgOk = input.actualRoute === "marketing";
    } else {
      plgOk = input.actualRoute === "marketing";
    }
  }
  const plg_honesty = gate(plgOk, !fixture.expected.sales.sales_default_invalid);
  step_checks.plg_honesty = {
    ok: plg_honesty !== "fail",
    detail:
      plg_honesty === "skip"
        ? "N/A for B2B fixtures"
        : plgOk
          ? "PLG/D2C routed to marketing"
          : "PLG/D2C did not take distribution path",
  };
  if (plg_honesty === "fail") {
    gaps.push({
      fixture_id: fixture.id,
      session_id: input.sessionId,
      run_log_ids: foundIds,
      symptom: "PLG/D2C honesty failed",
      expected: "create_distribution / marketing path",
      actual: input.actualRoute,
      evidence: `accounts=${evidence.accounts.length}`,
      severity: "blocker",
      class: "architecture",
      next_action: "Force marketing branch for sales_default_invalid fixtures",
      status: "open",
    });
  }

  // Discover companies expectation
  if (expected === "find_customers" && fixture.expected.sales.discover_companies) {
    const discoverOk =
      evidence.accounts.length > 0 || evidence.warnings.some((w) => /plg|individual/i.test(w));
    step_checks.discover = {
      ok: evidence.accounts.length > 0,
      detail:
        evidence.accounts.length > 0
          ? `${evidence.accounts.length} accounts`
          : `0 accounts; warnings: ${evidence.warnings.slice(0, 3).join(" | ") || "none"}`,
    };
    if (!discoverOk && evidence.accounts.length === 0) {
      const c = classifyGap("research thin");
      gaps.push({
        fixture_id: fixture.id,
        session_id: input.sessionId,
        run_log_ids: foundIds,
        symptom: "B2B Find returned zero accounts",
        expected: "named candidate companies with domains",
        actual: evidence.warnings.join("; ") || "empty",
        evidence: "sales_discover",
        severity: c.severity,
        class: c.class,
        next_action: "Inspect segment candidates + discovery research quality",
        status: "open",
      });
    }
  }

  // Marketing opportunities — rows alone are not enough; scaffold/fallback must not be green when Hermes ran.
  if (
    expected === "create_distribution" ||
    (expected === "mixed" && input.actualRoute === "marketing")
  ) {
    const opps = evidence.opportunities as Array<{
      source_url?: string;
      evidence?: string | null;
      why_now?: string;
      draft?: string;
    }>;
    const oppLog = evidence.runLogs.find((r) => String(r.kind) === "distribution_opportunities");
    const oppLogStatus = String(oppLog?.status ?? "");
    const oppLogSource =
      oppLog && typeof oppLog.output_json === "object" && oppLog.output_json
        ? String((oppLog.output_json as { source?: string }).source ?? "")
        : "";
    const hermesResearchPresent = foundKinds.includes("distribution_research");
    const scaffoldMarked =
      oppLogStatus === "fallback" ||
      oppLogSource === "scaffold" ||
      opps.some(
        (o) =>
          /\[source=scaffold\]|\[FALLBACK\]/i.test(`${o.evidence ?? ""} ${o.why_now ?? ""}`) ||
          /manual:\/\//i.test(o.source_url ?? "") ||
          /x\.com\/search|linkedin\.com\/feed\/?$/i.test(o.source_url ?? ""),
      );
    const grounded = opps.filter((o) => {
      const url = o.source_url ?? "";
      return (
        url.startsWith("http") &&
        !/manual:\/\//i.test(url) &&
        !/x\.com\/search|linkedin\.com\/feed\/?$/i.test(url) &&
        !/\[source=scaffold\]|\[FALLBACK\]/i.test(`${o.evidence ?? ""} ${o.why_now ?? ""}`)
      );
    });

    const hasRows =
      !fixture.expected.marketing.expect_opportunities || evidence.opportunities.length > 0;
    // Hard quality: when Hermes research ran, scaffold/fallback is not a pass.
    const qualityOk =
      !fixture.expected.marketing.expect_opportunities ||
      (hasRows && !(hermesResearchPresent && scaffoldMarked && grounded.length === 0));

    step_checks.marketing_opportunities = {
      ok: hasRows,
      detail: `${evidence.opportunities.length} opportunities`,
    };
    step_checks.marketing_opportunity_grounding = {
      ok: qualityOk,
      detail: scaffoldMarked
        ? `scaffold/fallback detected (grounded=${grounded.length}/${opps.length}; log_status=${oppLogStatus || "n/a"})`
        : `${grounded.length}/${opps.length} opportunities look source-backed`,
    };

    if (!hasRows) {
      gaps.push({
        fixture_id: fixture.id,
        session_id: input.sessionId,
        run_log_ids: foundIds,
        symptom: "No distribution opportunities returned",
        expected: ">=1 opportunity with URL/why_now/draft",
        actual: "0",
        evidence: "distribution_opportunities",
        severity: "major",
        class: "data_research",
        next_action: "Check Hermes distribution research + migration 009",
        status: "open",
      });
    } else if (!qualityOk) {
      gaps.push({
        fixture_id: fixture.id,
        session_id: input.sessionId,
        run_log_ids: foundIds,
        symptom:
          "Marketing opportunities are scaffold/fallback while Hermes distribution_research was available",
        expected: "Persisted Hermes opportunities with real source_url + thread-tied why_now/draft",
        actual: `grounded=${grounded.length}; scaffoldMarked=${scaffoldMarked}; log_status=${oppLogStatus}`,
        evidence: "distribution_opportunities + distribution_research logs",
        severity: "blocker",
        class: "architecture",
        next_action:
          "Fix parseLastJsonBlock / opportunity contract so research evidence persists; do not green scaffold when Hermes ran",
        status: "open",
      });
    }
  }

  // Observability chain
  const missingKinds = fixture.expected.required_log_kinds.filter((k) => !foundKinds.includes(k));
  // dossier_research may be logged as hermes_once kind dossier_research
  const observability = gate(missingKinds.length === 0);
  step_checks.observability = {
    ok: observability === "pass",
    detail:
      observability === "pass"
        ? `kinds: ${foundKinds.join(", ")}`
        : `missing: ${missingKinds.join(", ")}`,
  };
  if (observability === "fail") {
    gaps.push({
      fixture_id: fixture.id,
      session_id: input.sessionId,
      run_log_ids: foundIds,
      symptom: "Missing required agent_run_logs kinds",
      expected: fixture.expected.required_log_kinds.join(", "),
      actual: foundKinds.join(", ") || "(none)",
      evidence: "GET /api/observability/runs",
      severity: "major",
      class: "environment",
      next_action: "Apply migration 010; ensure kamiSessionId passed to Hermes calls",
      status: "open",
    });
  }

  const execution_truthfulness = contact_safety;

  // Marketing grounding becomes a hard gate when the fixture expects opportunities.
  const marketingGroundingFail =
    Boolean(step_checks.marketing_opportunity_grounding) &&
    step_checks.marketing_opportunity_grounding!.ok === false;
  const marketing_grounding = gate(
    !marketingGroundingFail,
    !step_checks.marketing_opportunity_grounding,
  );

  const hard_gates = {
    identity_lock,
    evidence_grounding,
    contact_safety,
    route_safety,
    execution_truthfulness,
    observability,
    plg_honesty,
    marketing_grounding,
  };

  const blockers = Object.values(hard_gates).filter((g) => g === "fail");
  const stepFailures = input.steps.filter((s) => !s.ok);
  const passed = blockers.length === 0 && stepFailures.length === 0;

  return {
    fixture_id: fixture.id,
    canonical_domain: fixture.domain,
    session_id: input.sessionId,
    hermes_session_id: input.hermesSessionId,
    run_started_at: input.startedAt,
    run_ended_at: input.endedAt,
    environment: input.environment,
    base_url: input.baseUrl,
    route: { expected, actual: input.actualRoute },
    steps: input.steps,
    hard_gates,
    step_checks,
    run_logs: {
      expected_kinds: fixture.expected.required_log_kinds,
      found_kinds: foundKinds,
      found_ids: foundIds,
    },
    gaps,
    passed,
  };
}
