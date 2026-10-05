/** Machine-testable E2E fixture + scorecard types. */

export type ExpectedJob = "find_customers" | "create_distribution" | "mixed";
export type RcaClass = "patch" | "prompt_skill" | "architecture" | "data_research" | "environment";

export interface CompanyFixture {
  id: string;
  domain: string;
  tags: string[];
  expected: {
    job_primary: ExpectedJob;
    /** Soft-match substrings that should appear in dossier positioning/category. */
    dossier_must_include: string[];
    /** Substrings that must NOT appear (homonyms / wrong vertical). */
    dossier_must_not: string[];
    company_name_hints: string[];
    sales: {
      /** Whether company Find should produce accounts. */
      discover_companies: boolean;
      /** Sales path is invalid as default (PLG/D2C). */
      sales_default_invalid?: boolean;
    };
    marketing: {
      goal: "launch" | "early_users" | "credibility" | "waitlist";
      expect_opportunities: boolean;
    };
    must_not: string[];
    required_log_kinds: string[];
  };
  notes?: string;
}

export interface StepResult {
  name: string;
  ok: boolean;
  ms: number;
  status?: number;
  error?: string;
  summary?: string;
}

export interface CollectedEvidence {
  session: Record<string, unknown> | null;
  brand: Record<string, unknown> | null;
  dossier: Record<string, unknown> | null;
  runLogs: Array<Record<string, unknown>>;
  salesConfig: Record<string, unknown> | null;
  segments: unknown[] | null;
  plan: Record<string, unknown> | null;
  accounts: unknown[];
  drafts: unknown[];
  distributionConfig: Record<string, unknown> | null;
  opportunities: unknown[];
  warnings: string[];
}

export type GateResult = "pass" | "fail" | "skip";

export interface Scorecard {
  fixture_id: string;
  canonical_domain: string;
  session_id: string | null;
  hermes_session_id: string | null;
  run_started_at: string;
  run_ended_at: string;
  environment: string;
  base_url: string;
  route: {
    expected: ExpectedJob;
    actual: "sales" | "marketing" | "mixed" | "blocked" | "unknown";
  };
  steps: StepResult[];
  hard_gates: {
    identity_lock: GateResult;
    evidence_grounding: GateResult;
    contact_safety: GateResult;
    route_safety: GateResult;
    execution_truthfulness: GateResult;
    observability: GateResult;
    plg_honesty: GateResult;
    /** Fail when scaffold/fallback persists while Hermes research was available. */
    marketing_grounding: GateResult;
  };
  step_checks: Record<string, { ok: boolean; detail: string }>;
  run_logs: { expected_kinds: string[]; found_kinds: string[]; found_ids: string[] };
  gaps: GapEntry[];
  passed: boolean;
}

export interface GapEntry {
  fixture_id: string;
  session_id: string | null;
  run_log_ids: string[];
  symptom: string;
  expected: string;
  actual: string;
  evidence: string;
  severity: "blocker" | "major" | "minor";
  class: RcaClass;
  next_action: string;
  status: "open" | "fixed" | "wontfix";
}
