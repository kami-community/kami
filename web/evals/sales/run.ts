import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyReplyContent } from "../../lib/salesClassify";
import { reviewEmailDraft, type ReviewDraftInput } from "../../lib/salesReview";
import { buildEmailSequence } from "../../lib/salesSequences";
import {
  extractCompanyDomainsFromContent,
  isDomainBlocked,
  isListicleTitle,
  normalizeCompanyDomain,
  decayIntent,
  scoreAccountAxes,
  assignTierFromAxes,
} from "../../lib/salesResearch";
import { synthesizePlanFromConfig } from "../../lib/salesPlan";
import {
  cleanPositioningLine,
  salesWhoLabel,
  dossierToNlPrefill,
} from "../../lib/salesDossierPrefill";
import { isSameBrandHost, normalizeDomainInput } from "../../lib/domainIdentity";
import { validateDossier } from "../../lib/dossierValidation";
import { segmentsFromDossier, type SalesSegment } from "../../lib/salesSegments";
import { validateSegmentsForConfirm } from "../../lib/salesSegmentGates";
import { setupInvalidatesSegments } from "../../lib/salesSetupIntegrity";
import { ctaFromGoal } from "../../lib/salesSequences";
import type { DomainIdentity } from "../../lib/domainIdentity";
import type { SalesCampaignConfig } from "../../lib/salesTypes";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesPath = join(__dirname, "fixtures.json");

interface BriefFixture {
  id: string;
  config: Partial<SalesCampaignConfig>;
  expect: {
    quality: "precise" | "overbroad" | "conflicting";
    actionable: boolean;
    has_blockers: boolean;
  };
}

interface DraftFixture {
  id: string;
  input: ReviewDraftInput;
  expect: {
    approved: boolean;
    failed_criteria?: string[];
    failed_criteria_includes?: string[];
  };
}

interface ReplyFixture {
  id: string;
  content: string;
  expect: {
    label: string;
    escalation_required: boolean;
  };
}

interface SequenceFixture {
  id: string;
  params: Parameters<typeof buildEmailSequence>[0];
  expect: {
    step_count: number;
    step1_has_signal_ref: boolean;
    step1_reviewer_approved: boolean;
    all_have_opt_out: boolean;
    max_body_words: number;
  };
}

interface PolicyScenario {
  id: string;
  description: string;
  manual_check: string;
  acceptance_ref: string;
}

interface Fixtures {
  briefs: BriefFixture[];
  drafts: DraftFixture[];
  replies: ReplyFixture[];
  sequences: SequenceFixture[];
  policy_scenarios: PolicyScenario[];
}

interface BriefEvaluation {
  quality: "precise" | "overbroad" | "conflicting";
  actionable: boolean;
  blockers: string[];
}

function loadFixtures(): Fixtures {
  return JSON.parse(readFileSync(fixturesPath, "utf8")) as Fixtures;
}

/** Inline brief rubric — mirrors plan/research prerequisites without Supabase. */
function evaluateBrief(config: Partial<SalesCampaignConfig>): BriefEvaluation {
  const icp = config.icp ?? { titles: [], industries: [] };
  const blockers: string[] = [];

  const hasTitles = (icp.titles?.length ?? 0) >= 1;
  const hasIndustries = (icp.industries?.length ?? 0) >= 1;
  const hasSize = Boolean(icp.size?.trim());
  const hasGeo = Boolean(config.geo?.trim() || icp.geo?.trim());
  const specificityScore = [hasTitles, hasIndustries, hasSize, hasGeo].filter(Boolean).length;

  const geo = (config.geo || icp.geo || "").toLowerCase();
  for (const rule of config.exclusions ?? []) {
    const normalized = rule.toLowerCase();
    if (geo && (geo.includes(normalized) || normalized.includes(geo))) {
      blockers.push("geo_conflicts_with_exclusions");
      break;
    }
  }

  const cap = config.daily_send_cap ?? 35;
  const qty = config.target_quantity ?? 50;
  if (qty > cap * 30) {
    blockers.push("target_quantity_exceeds_monthly_cap");
  }

  if (config.autonomy?.auto_followups && config.autonomous_paused) {
    blockers.push("auto_followups_while_paused");
  }

  let quality: BriefEvaluation["quality"];
  if (blockers.length > 0) {
    quality = "conflicting";
  } else if (specificityScore >= 3 && (icp.titles?.length ?? 0) >= 2) {
    quality = "precise";
  } else {
    quality = "overbroad";
  }

  const actionable = quality === "precise" && blockers.length === 0;
  return { quality, actionable, blockers };
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function assertEqual<T>(actual: T, expected: T, label: string, errors: string[]): void {
  if (actual !== expected) {
    errors.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(actual: string[], expected: string, label: string, errors: string[]): void {
  if (!actual.includes(expected)) {
    errors.push(
      `${label}: expected failed_criteria to include "${expected}", got ${JSON.stringify(actual)}`,
    );
  }
}

function runBriefs(fixtures: BriefFixture[], passed: string[], failed: string[]): void {
  for (const fixture of fixtures) {
    const result = evaluateBrief(fixture.config);
    const errors: string[] = [];

    assertEqual(result.quality, fixture.expect.quality, "quality", errors);
    assertEqual(result.actionable, fixture.expect.actionable, "actionable", errors);
    assertEqual(result.blockers.length > 0, fixture.expect.has_blockers, "has_blockers", errors);

    if (errors.length) {
      failed.push(`brief/${fixture.id}: ${errors.join("; ")}`);
    } else {
      passed.push(`brief/${fixture.id}`);
    }
  }
}

function runDrafts(fixtures: DraftFixture[], passed: string[], failed: string[]): void {
  for (const fixture of fixtures) {
    const verdict = reviewEmailDraft(fixture.input);
    const errors: string[] = [];

    assertEqual(verdict.approved, fixture.expect.approved, "approved", errors);

    if (fixture.expect.failed_criteria) {
      assertEqual(
        [...verdict.failed_criteria].sort().join(","),
        [...fixture.expect.failed_criteria].sort().join(","),
        "failed_criteria",
        errors,
      );
    }

    for (const criterion of fixture.expect.failed_criteria_includes ?? []) {
      assertIncludes(verdict.failed_criteria, criterion, "failed_criteria", errors);
    }

    if (errors.length) {
      failed.push(`draft/${fixture.id}: ${errors.join("; ")}`);
    } else {
      passed.push(`draft/${fixture.id}`);
    }
  }
}

function runReplies(fixtures: ReplyFixture[], passed: string[], failed: string[]): void {
  for (const fixture of fixtures) {
    const result = classifyReplyContent(fixture.content);
    const errors: string[] = [];

    assertEqual(result.label, fixture.expect.label, "label", errors);
    assertEqual(
      result.escalation_required,
      fixture.expect.escalation_required,
      "escalation_required",
      errors,
    );

    if (errors.length) {
      failed.push(`reply/${fixture.id}: ${errors.join("; ")}`);
    } else {
      passed.push(`reply/${fixture.id}`);
    }
  }
}

function runSequences(fixtures: SequenceFixture[], passed: string[], failed: string[]): void {
  for (const fixture of fixtures) {
    const drafts = buildEmailSequence(fixture.params);
    const errors: string[] = [];
    const step1 = drafts[0];

    assertEqual(drafts.length, fixture.expect.step_count, "step_count", errors);
    assertEqual(
      Boolean(step1?.signal_ref),
      fixture.expect.step1_has_signal_ref,
      "step1_has_signal_ref",
      errors,
    );

    const step1Verdict = step1
      ? reviewEmailDraft({
          subject: step1.subject,
          body: step1.body,
          cta: step1.cta,
          sequence_step: step1.sequence_step,
          signal_ref: step1.signal_ref,
          approved_claims: fixture.params.claims,
        })
      : null;

    assertEqual(
      step1Verdict?.approved ?? false,
      fixture.expect.step1_reviewer_approved,
      "step1_reviewer_approved",
      errors,
    );

    const allOptOut = drafts.every(
      (d) => d.body.includes("unsubscribe") || d.body.includes("won't follow up"),
    );
    assertEqual(allOptOut, fixture.expect.all_have_opt_out, "all_have_opt_out", errors);

    const maxWords = Math.max(...drafts.map((d) => wordCount(d.body)));
    if (maxWords > fixture.expect.max_body_words) {
      errors.push(`max_body_words: expected <= ${fixture.expect.max_body_words}, got ${maxWords}`);
    }

    if (errors.length) {
      failed.push(`sequence/${fixture.id}: ${errors.join("; ")}`);
    } else {
      passed.push(`sequence/${fixture.id}`);
    }
  }
}

function runResearchAndPlanGates(passed: string[], failed: string[]): void {
  const errors: string[] = [];

  if (!isDomainBlocked("wellfound.com")) {
    errors.push("wellfound.com should be blocked");
  } else {
    passed.push("research/blocklist_wellfound");
  }

  if (!isDomainBlocked("underdog.io")) {
    errors.push("underdog.io should be blocked");
  } else {
    passed.push("research/blocklist_underdog");
  }

  // Shorteners / aggregators from overhaul
  for (const host of [
    "ow.ly",
    "ift.tt",
    "lnkd.in",
    "bit.ly",
    "ziprecruiter.com",
    "topstartups.io",
    "growthlist.co",
  ]) {
    if (!isDomainBlocked(host)) errors.push(`${host} should be blocked`);
    else passed.push(`research/blocklist_${host.replace(/\./g, "_")}`);
  }

  if (!isListicleTitle("Best SaaS Companies to Work for in United Kingdom 2026")) {
    errors.push("listicle title should be rejected");
  } else {
    passed.push("research/listicle_title_reject");
  }

  if (!isListicleTitle("28 Hot Healthcare Startups Hiring Now")) {
    errors.push("hot startups listicle should be rejected");
  } else {
    passed.push("research/listicle_hot_reject");
  }

  if (!isListicleTitle("Top 10 Telehealth Business Ideas 2026")) {
    errors.push("business ideas listicle should be rejected");
  } else {
    passed.push("research/listicle_ideas_reject");
  }

  if (isListicleTitle("Acme Robotics")) {
    errors.push("company name should not be treated as listicle");
  } else {
    passed.push("research/company_title_ok");
  }

  if (normalizeCompanyDomain("ow.ly") !== null) {
    errors.push("normalizeCompanyDomain should reject ow.ly");
  } else {
    passed.push("research/normalize_reject_shortener");
  }

  if (normalizeCompanyDomain("acme.io") !== "acme.io") {
    errors.push("normalizeCompanyDomain should accept acme.io");
  } else {
    passed.push("research/normalize_accept_company");
  }

  const extracted = extractCompanyDomainsFromContent(
    "Visit https://acme.io/careers and https://wellfound.com/lists/saas for more.",
    "wellfound.com",
    "cal.com",
  );
  if (!extracted.includes("acme.io") || extracted.includes("wellfound.com")) {
    errors.push(`content domain extract expected acme.io only, got ${extracted.join(",")}`);
  } else {
    passed.push("research/extract_company_from_content");
  }

  // Intent decay
  if (!(
    decayIntent(7, 0.8) > decayIntent(30, 0.8) && decayIntent(30, 0.8) > decayIntent(90, 0.8)
  )) {
    errors.push("intent should decay with age");
  } else {
    passed.push("research/intent_decay");
  }

  const scored = scoreAccountAxes({
    fit: 0.8,
    intentRaw: 0.8,
    hasVerifiedContact: true,
    signalAgeDays: 10,
  });
  if (scored.priority <= 0 || !scored.explanation.includes("Fit")) {
    errors.push("scoreAccountAxes should produce priority + plain explanation");
  } else {
    passed.push("research/fit_intent_score");
  }

  const gated = scoreAccountAxes({
    fit: 0.1,
    intentRaw: 0.9,
    hasVerifiedContact: true,
    signalAgeDays: 5,
  });
  if (gated.priority !== 0) {
    errors.push("fit floor should zero priority");
  } else {
    passed.push("research/fit_floor_gate");
  }

  if (assignTierFromAxes(0.8, 0.7, true) !== 1) {
    errors.push("tier 1 expected for high fit/intent + contact");
  } else {
    passed.push("research/tier_assign");
  }

  // Positioning cleanliness — no mid-word cut
  const long =
    "Cal.com sells customizable scheduling infrastructure for individuals, teams, enterprises, and developers rather than just a simple booking link. Its differentiators include deep embeds.";
  const clean = cleanPositioningLine(long, "Cal.com");
  if (clean.includes("differentia") && !clean.includes("differentiators")) {
    errors.push("positioning line should not mid-word truncate");
  } else if (clean.length > 140) {
    errors.push(`positioning line too long: ${clean.length}`);
  } else if (!clean.startsWith("Cal.com")) {
    errors.push("positioning should keep first sentence start");
  } else {
    passed.push("plan/positioning_clean");
  }

  const plan = synthesizePlanFromConfig(
    {
      session_id: "eval",
      offer: "Cal.com helps revenue teams book more qualified meetings",
      icp: { titles: ["VP Sales"], industries: ["B2B SaaS"], geo: "US" },
      allowed_channels: ["email"],
      target_quantity: 15,
      daily_send_cap: 5,
      autonomy: { paused: false, auto_followups: true, require_first_send_approval: true },
    },
    "campaign-eval",
    1,
  );
  const planText = `${plan.channel_rationale} ${plan.motions.map((m) => m.rationale).join(" ")}`;
  if (!planText.includes("Cal.com helps revenue teams")) {
    errors.push("plan synthesis should include offer substring");
  } else {
    passed.push("plan/offer_in_synthesis");
  }

  if (
    !plan.tiers[0]?.criteria.includes("Best-fit") &&
    !plan.tiers[0]?.criteria.toLowerCase().includes("best-fit")
  ) {
    // plain English criteria
    if (plan.tiers[0]?.criteria.includes("bullseye")) {
      errors.push("tier criteria must not use ICP bullseye jargon");
    } else {
      passed.push("plan/plain_english_tiers");
    }
  } else {
    passed.push("plan/plain_english_tiers");
  }

  // Email verification gate (logic): contactability without verified email stays low
  const noEmail = scoreAccountAxes({
    fit: 0.9,
    intentRaw: 0.9,
    hasVerifiedContact: false,
    signalAgeDays: 5,
  });
  if (noEmail.contactability >= 0.6) {
    errors.push("missing verified email must keep contactability low");
  } else {
    passed.push("research/email_verification_gate");
  }

  for (const e of errors) failed.push(`research_plan_gates: ${e}`);
}

function runDomainTruthGates(passed: string[], failed: string[]): void {
  const errors: string[] = [];

  // Invalid domain normalization blocks before session/Hermes
  if (normalizeDomainInput("not a domain") !== null) {
    errors.push("normalizeDomainInput should reject free text");
  } else if (normalizeDomainInput("localhost") !== null) {
    errors.push("normalizeDomainInput should reject localhost");
  } else if (normalizeDomainInput("https://arguslabs.in/about") !== "arguslabs.in") {
    errors.push("normalizeDomainInput should strip path to host");
  } else if (!isSameBrandHost("notion.so", "notion.com")) {
    errors.push("isSameBrandHost should allow notion.so → notion.com");
  } else if (isSameBrandHost("notion.so", "figma.com")) {
    errors.push("isSameBrandHost must reject unrelated redirects");
  } else {
    passed.push("domain/normalize_and_reject");
  }

  const argusIdentity: DomainIdentity = {
    input: "arguslabs.in",
    canonical_domain: "arguslabs.in",
    final_url: "https://arguslabs.in/",
    company_name: "Argus",
    title: "Argus — AI agent observability",
    description: "Debug and observe AI agents in production",
    h1: "Agent observability",
    excerpt:
      "Argus helps teams debug AI agents with traces, evals, and production observability for LLM apps.",
    evidence_url: "https://arguslabs.in/",
    confidence: 0.9,
    validated_at: new Date().toISOString(),
  };

  // Homonym reject: biomedical dossier vs agent-observability site
  const badDossier = {
    company: "Argus Labs",
    brand_voice: "clinical",
    positioning:
      "Argus Labs is a biotech pharma company building healthcare clinic medical device diagnostics.",
    canonical_domain: "arguslabs.in",
    evidence_urls: ["https://arguslabs.in/"],
    icp_buckets: [
      {
        label: "Clinics",
        where_they_live: "hospitals",
        trigger_signal: "FDA",
        est_size: "1k",
        angle: "labs",
      },
      {
        label: "Labs",
        where_they_live: "R&D",
        trigger_signal: "grant",
        est_size: "500",
        angle: "assay",
      },
    ],
    opportunities: [{ title: "Lab outreach", playbook: "outbound", detail: "reach clinics" }],
    competitor_analysis: [],
  };
  const rejected = validateDossier(badDossier, argusIdentity);
  if (rejected.ok) {
    errors.push("validateDossier must reject healthcare narrative absent from first-party extract");
  } else {
    passed.push("domain/homonym_health_reject");
  }

  // Domain mismatch reject
  const mismatch = validateDossier(
    {
      ...badDossier,
      positioning:
        "Argus provides AI agent observability and debugging for production LLM systems.",
      canonical_domain: "other-company.com",
      evidence_urls: ["https://other-company.com/"],
    },
    argusIdentity,
  );
  if (mismatch.ok) {
    errors.push("validateDossier must reject canonical_domain mismatch");
  } else {
    passed.push("domain/canonical_mismatch_reject");
  }

  // Good dossier for argus
  const good = validateDossier(
    {
      company: "Argus",
      brand_voice: "technical, precise",
      positioning:
        "Argus provides AI agent observability and debugging for production LLM and multi-agent systems.",
      canonical_domain: "arguslabs.in",
      evidence_urls: ["https://arguslabs.in/"],
      product_category: "AI agent observability",
      industries: ["AI infrastructure"],
      personas: ["AI eng lead"],
      icp_buckets: [
        {
          label: "AI platform teams",
          where_they_live: "Slack / Discord",
          trigger_signal: "shipping agents to prod",
          est_size: "mid-market",
          angle: "trace failures faster",
        },
        {
          label: "Agent startups",
          where_they_live: "X / HN",
          trigger_signal: "launch week",
          est_size: "seed-A",
          angle: "eval + debug loop",
        },
      ],
      opportunities: [
        {
          title: "Agent observability outreach",
          playbook: "outbound",
          detail: "reach AI eng leads",
        },
      ],
      competitor_analysis: [{ name: "LangSmith", insight: "broader LLM ops" }],
    },
    argusIdentity,
  );
  if (!good.ok) {
    errors.push(`good argus dossier should pass: ${good.errors.join("; ")}`);
  } else if (!/observab|agent|debug|llm/i.test(good.dossier!.positioning)) {
    errors.push("good dossier should keep agent-observability positioning");
  } else {
    passed.push("domain/argus_observability_ok");
  }

  // Product-neutral segment fallback — never Calendly/bookings/healthcare without evidence
  const blankSegs = segmentsFromDossier(
    {
      company: "Argus",
      brand_voice: "technical",
      positioning: "AI agent observability for production debugging",
      competitor_analysis: [],
      icp_buckets: [],
      opportunities: [],
      product_category: "AI observability",
    },
    "arguslabs.in",
  );
  const blob = JSON.stringify(blankSegs).toLowerCase();
  if (/\bcalendly\b|\bbookings?\b|\bhealthcare\b|\bbiotech\b/.test(blob)) {
    errors.push("segmentsFromDossier must not inject Calendly/bookings/healthcare defaults");
  } else {
    passed.push("domain/product_neutral_segments");
  }

  const prefill = dossierToNlPrefill(
    {
      company: "Argus",
      brand_voice: "technical",
      positioning: "AI agent observability for production debugging of multi-agent systems.",
      competitor_analysis: [],
      icp_buckets: [],
      opportunities: [],
    },
    "arguslabs.in",
  );
  const prefillBlob = JSON.stringify(prefill).toLowerCase();
  if (/\bcalendly\b|\bbookings?\b|\b50-500\b|\bb2b saas\b/.test(prefillBlob)) {
    errors.push("dossierToNlPrefill must not inject scheduling/SaaS size defaults");
  } else {
    passed.push("domain/product_neutral_prefill");
  }

  // Candidate-company validation
  const b2bEmpty: SalesSegment[] = [
    {
      key: "s1",
      name: "AI teams",
      why_fit: "need observability",
      firmographic: "",
      technographic: "",
      trigger_signal: "shipping agents",
      motion: "b2b_sales_assisted",
      target_persona: "Eng lead",
      target_count: 5,
      candidate_companies: [],
      example_user_personas: [],
    },
  ];
  if (!validateSegmentsForConfirm(b2bEmpty)?.includes("candidate")) {
    errors.push("B2B segment without candidates must fail confirm validation");
  } else {
    passed.push("domain/candidate_required");
  }

  const b2bOk: SalesSegment[] = [
    {
      ...b2bEmpty[0],
      candidate_companies: [{ name: "Acme Agents", domain: "acmeagents.dev", why: "ships agents" }],
    },
  ];
  if (validateSegmentsForConfirm(b2bOk) !== null) {
    errors.push("B2B segment with candidate should confirm");
  } else {
    passed.push("domain/candidate_ok");
  }

  // Setup change invalidates segments
  const invalidate = setupInvalidatesSegments(
    {
      offer: "Old offer about X",
      icp: { titles: ["VP Sales"], industries: ["SaaS"] },
      geo: "US",
    },
    {
      offer: "New offer about Y",
      icp: { titles: ["VP Sales"], industries: ["SaaS"] },
      geo: "US",
    },
  );
  if (!invalidate) {
    errors.push("offer change must invalidate segments");
  } else {
    passed.push("domain/setup_invalidates_segments");
  }

  const stable = setupInvalidatesSegments(
    {
      offer: "Same offer",
      icp: { titles: ["VP Sales"], industries: ["SaaS"] },
      geo: "US",
    },
    {
      offer: "Same offer",
      icp: { titles: ["VP Sales"], industries: ["SaaS"] },
      geo: "US",
    },
  );
  if (stable) {
    errors.push("identical setup must not invalidate segments");
  } else {
    passed.push("domain/setup_stable");
  }

  // Goal-specific CTAs / labels
  if (!ctaFromGoal("investor outreach").toLowerCase().includes("intro")) {
    errors.push("investor goal should get intro CTA");
  } else if (ctaFromGoal("product trial signups").toLowerCase().includes("15-minute")) {
    errors.push("trial goal should not default to 15-minute call");
  } else if (salesWhoLabel(["awareness"]).includes("book")) {
    errors.push("awareness label should not say book meetings");
  } else {
    passed.push("domain/goal_aware_cta_labels");
  }

  // Offline plan says research confirmation when thin
  const thinPlan = synthesizePlanFromConfig(
    {
      session_id: "eval",
      offer: "confirm positioning from Overview research.",
      icp: { titles: [], industries: [] },
      allowed_channels: ["email"],
      target_quantity: 10,
      autonomy: { paused: false, auto_followups: true, require_first_send_approval: true },
    },
    "c1",
    1,
    null,
  );
  if (/\bcalendly\b|\bhealthcare\b/i.test(thinPlan.channel_rationale)) {
    errors.push("thin plan must stay product-neutral");
  } else {
    passed.push("domain/thin_plan_neutral");
  }

  for (const e of errors) failed.push(`domain_truth: ${e}`);
}

function printManualPolicyChecks(scenarios: PolicyScenario[]): void {
  console.log("\nManual policy checks (require Supabase + API — not counted in pass/fail):");
  for (const scenario of scenarios) {
    console.log(`  [MANUAL] ${scenario.id}`);
    console.log(`           ${scenario.description}`);
    console.log(`           Check: ${scenario.manual_check}`);
    console.log(`           Ref:   ${scenario.acceptance_ref}`);
  }
}

function main(): void {
  const fixtures = loadFixtures();
  const passed: string[] = [];
  const failed: string[] = [];

  runBriefs(fixtures.briefs, passed, failed);
  runDrafts(fixtures.drafts, passed, failed);
  runReplies(fixtures.replies, passed, failed);
  runSequences(fixtures.sequences, passed, failed);
  runResearchAndPlanGates(passed, failed);
  runDomainTruthGates(passed, failed);

  console.log("Sales eval results");
  console.log("==================");
  for (const id of passed) console.log(`  PASS  ${id}`);
  for (const id of failed) console.log(`  FAIL  ${id}`);

  printManualPolicyChecks(fixtures.policy_scenarios);

  console.log(`\nAutomated: ${passed.length} passed, ${failed.length} failed`);
  console.log(`Manual policy scenarios: ${fixtures.policy_scenarios.length} (documented above)`);

  if (failed.length > 0) process.exit(1);
}

main();
