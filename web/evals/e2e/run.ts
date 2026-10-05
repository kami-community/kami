/**
 * API-scripted E2E founder-path harness for the 10-company gold corpus.
 *
 * Safety: never calls email send or distribution publish.
 *
 * Usage (from web/):
 *   npx tsx evals/e2e/run.ts --fixture argus
 *   npx tsx evals/e2e/run.ts --fixture mirage,cal --base-url http://localhost:3000
 *   npx tsx evals/e2e/run.ts --all
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ApiClient, ApiError } from "./lib/apiClient";
import { collectEvidence } from "./lib/collect";
import { appendGaps, gapLogPath, writeAggregateReport } from "./lib/gapLog";
import { scoreRun } from "./lib/score";
import type { CompanyFixture, Scorecard, StepResult } from "./lib/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const E2E_DIR = __dirname;
const FIXTURES_PATH = join(E2E_DIR, "fixtures", "companies.json");
const RESULTS_DIR = join(E2E_DIR, "results");

interface CliArgs {
  fixtures: string[] | "all";
  baseUrl: string;
  environment: string;
  keepResults: boolean;
  preflightOnly: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let fixtures: string[] | "all" = "all";
  let baseUrl = process.env.E2E_BASE_URL || process.env.BASE_URL || "http://localhost:3000";
  let environment = process.env.E2E_ENVIRONMENT || "local";
  let keepResults = true;
  let preflightOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") fixtures = "all";
    else if (a === "--fixture" || a === "--fixtures") {
      const v = argv[++i] ?? "";
      fixtures = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === "--base-url") baseUrl = argv[++i] ?? baseUrl;
    else if (a === "--environment") environment = argv[++i] ?? environment;
    else if (a === "--no-keep-results") keepResults = false;
    else if (a === "--preflight") preflightOnly = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: npx tsx evals/e2e/run.ts [options]
  --all                         Run all fixtures (default)
  --fixture id[,id…]            Run subset (e.g. argus,mirage)
  --base-url URL                Default http://localhost:3000
  --environment name            local | staging (label only)
  --preflight                   Capabilities check only
  --no-keep-results             Do not write JSON artifacts`);
      process.exit(0);
    }
  }

  return { fixtures, baseUrl, environment, keepResults, preflightOnly };
}

function loadFixtures(): CompanyFixture[] {
  return JSON.parse(readFileSync(FIXTURES_PATH, "utf8")) as CompanyFixture[];
}

function selectFixtures(all: CompanyFixture[], sel: string[] | "all"): CompanyFixture[] {
  if (sel === "all") return all;
  const byId = new Map(all.map((f) => [f.id, f]));
  const out: CompanyFixture[] = [];
  for (const id of sel) {
    const f = byId.get(id);
    if (!f) throw new Error(`Unknown fixture id: ${id}. Known: ${all.map((x) => x.id).join(", ")}`);
    out.push(f);
  }
  return out;
}

function pickRoute(fixture: CompanyFixture): "sales" | "marketing" {
  const job = fixture.expected.job_primary;
  if (job === "create_distribution") return "marketing";
  if (job === "find_customers") return "sales";
  // mixed — prefer Sales (B2B stress); still scored as mixed-OK
  if (fixture.expected.sales.sales_default_invalid) return "marketing";
  return "sales";
}

/** Mirror SegmentConfirm seedPlgPersonas — PLG confirm requires ≥1 example user. */
function seedPlgPersonas(segments: unknown[]): unknown[] {
  return segments.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const s = raw as Record<string, unknown>;
    if (s.motion !== "plg_self_serve") return raw;
    const personas = Array.isArray(s.example_user_personas) ? s.example_user_personas : [];
    const hasLabel = personas.some(
      (p) =>
        p &&
        typeof p === "object" &&
        typeof (p as { label?: unknown }).label === "string" &&
        String((p as { label: string }).label).trim(),
    );
    if (hasLabel) return raw;
    const seed =
      (typeof s.target_persona === "string" && s.target_persona.split(",")[0]?.trim()) ||
      "Example user";
    return {
      ...s,
      example_user_personas: [
        {
          label: seed,
          why_fit:
            (typeof s.why_fit === "string" ? s.why_fit.slice(0, 160) : "") ||
            "Would try this product on their own",
          personalization_hook: typeof s.trigger_signal === "string" ? s.trigger_signal : undefined,
        },
      ],
    };
  });
}

async function step(
  name: string,
  fn: () => Promise<{ summary?: string; status?: number } | void>,
): Promise<StepResult> {
  const started = Date.now();
  try {
    const r = await fn();
    return {
      name,
      ok: true,
      ms: Date.now() - started,
      status: r?.status,
      summary: r?.summary,
    };
  } catch (e) {
    const msg =
      e instanceof ApiError
        ? `${e.message} (HTTP ${e.status})${
            e.body && typeof e.body === "object" && "error" in (e.body as object)
              ? ""
              : e.body
                ? ` body=${JSON.stringify(e.body).slice(0, 300)}`
                : " body=(empty)"
          }`
        : e instanceof Error
          ? e.message
          : String(e);
    return {
      name,
      ok: false,
      ms: Date.now() - started,
      status: e instanceof ApiError ? e.status : undefined,
      error: msg,
    };
  }
}

async function preflight(api: ApiClient): Promise<void> {
  const { data } = await api.get<{
    hermes?: boolean;
    hermesReachable?: boolean;
    database?: boolean;
  }>("/api/capabilities");
  console.log("capabilities:", JSON.stringify(data));
  if (!data.hermes || !data.hermesReachable) {
    throw new Error("Hermes gateway not reachable — start Hermes and set HERMES_* env");
  }
  if (!data.database) {
    throw new Error(
      "Supabase not configured — set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY",
    );
  }
}

async function runFixture(
  api: ApiClient,
  fixture: CompanyFixture,
  opts: { environment: string; baseUrl: string },
): Promise<Scorecard> {
  const startedAt = new Date().toISOString();
  const steps: StepResult[] = [];
  let sessionId: string | null = null;
  let identity: Record<string, unknown> | null = null;
  let dossier: Record<string, unknown> | null = null;
  const route = pickRoute(fixture);
  let actualRoute: Scorecard["route"]["actual"] = "unknown";

  console.log(`\n=== ${fixture.id} (${fixture.domain}) → ${route} ===`);

  steps.push(
    await step("session_create", async () => {
      const { data, status } = await api.post<{ session: Record<string, unknown> }>(
        "/api/sessions",
        {
          domain: fixture.domain,
          goals: route === "marketing" ? ["early users"] : ["book meetings"],
          stage: "mvp",
        },
      );
      sessionId = String(data.session.id);
      identity = (data.session.domain_check as Record<string, unknown>) ?? null;
      return {
        status,
        summary: `${sessionId} · ${String(identity?.canonical_domain ?? fixture.domain)}`,
      };
    }),
  );
  if (!sessionId) return finalize();

  steps.push(
    await step("dossier_generate", async () => {
      const { data, status } = await api.post<{ dossier: Record<string, unknown> }>(
        `/api/sessions/${sessionId}/dossier`,
      );
      dossier = data.dossier;
      return { status, summary: String(data.dossier.company ?? "?") };
    }),
  );
  if (!steps[steps.length - 1].ok) {
    actualRoute = "blocked";
    return finalize();
  }

  steps.push(
    await step("dossier_confirm", async () => {
      const { status } = await api.post(`/api/sessions/${sessionId}/dossier/confirm`);
      return { status, summary: "That's us" };
    }),
  );

  if (route === "sales") {
    actualRoute = "sales";
    await runSalesPath();
  } else {
    actualRoute = "marketing";
    await runMarketingPath();
  }

  return finalize();

  async function runSalesPath(): Promise<void> {
    const company = String(dossier?.company ?? fixture.domain);
    const offer = String(dossier?.positioning ?? `${company} — confirm offer`).slice(0, 280);
    const titles = Array.isArray(dossier?.personas)
      ? (dossier!.personas as unknown[]).map(String).slice(0, 3)
      : ["Founder", "Head of Engineering"];
    const industries = Array.isArray(dossier?.industries)
      ? (dossier!.industries as unknown[]).map(String).slice(0, 4)
      : [String(dossier?.product_category ?? "B2B SaaS")];

    steps.push(
      await step("sales_setup", async () => {
        const { status } = await api.post("/api/sales/setup", {
          session_id: sessionId,
          offer,
          icp: { titles, industries },
          geo: Array.isArray(dossier?.geos) ? String((dossier!.geos as unknown[])[0] ?? "") : "",
          exclusions: ["media listicle", "publisher"],
          target_quantity: 15,
          daily_send_cap: 20,
          allowed_channels: ["email"],
          autonomy: {
            paused: false,
            auto_followups: false,
            require_first_send_approval: true,
          },
        });
        return { status, summary: "campaign configured" };
      }),
    );
    if (!steps[steps.length - 1].ok) return;

    let segments: unknown[] = [];
    steps.push(
      await step("sales_segments_derive", async () => {
        const { data, status } = await api.post<{
          segments?: unknown[];
          error?: string;
        }>("/api/sales/segments", {
          session_id: sessionId,
          action: "derive",
        });
        segments = data.segments ?? [];
        if (!segments.length) {
          throw new ApiError(data.error ?? "no segments derived", status, data);
        }
        return { status, summary: `${segments.length} segments` };
      }),
    );
    if (!steps[steps.length - 1].ok) return;

    steps.push(
      await step("sales_segments_confirm", async () => {
        const seeded = seedPlgPersonas(segments);
        segments = seeded;
        const { data, status } = await api.post<{
          confirmed_at?: string;
          error?: string;
          segments?: unknown[];
        }>("/api/sales/segments", {
          session_id: sessionId,
          action: "confirm",
          segments: seeded,
        });
        if (!data.confirmed_at) {
          throw new ApiError(data.error ?? "segments not confirmed", status, data);
        }
        return { status, summary: data.confirmed_at };
      }),
    );
    if (!steps[steps.length - 1].ok) return;

    let planId: string | null = null;
    steps.push(
      await step("sales_plan", async () => {
        const { data, status } = await api.post<{
          plan?: { id?: string };
          error?: string;
          source?: string;
        }>("/api/sales/plan", { session_id: sessionId });
        planId = data.plan?.id ?? null;
        if (!planId) {
          throw new ApiError(data.error ?? "no plan", status, data);
        }
        return { status, summary: `plan ${planId} (${data.source ?? "?"})` };
      }),
    );
    if (!planId) return;

    steps.push(
      await step("sales_plan_approve", async () => {
        const { status } = await api.post("/api/sales/plan", {
          session_id: sessionId,
          action: "approve",
          plan_id: planId,
        });
        return { status, summary: "approved" };
      }),
    );
    if (!steps[steps.length - 1].ok) return;

    steps.push(
      await step("sales_discover", async () => {
        try {
          const { data, status } = await api.post<{
            accounts?: unknown[];
            warnings?: string[];
            error?: string;
            count?: number;
          }>("/api/sales/discover", { session_id: sessionId });
          const n = data.accounts?.length ?? data.count ?? 0;
          return {
            status,
            summary: `${n} accounts; ${(data.warnings ?? []).slice(0, 2).join("; ") || "ok"}`,
          };
        } catch (e) {
          // Discover can outlive the first response; poll accounts before failing.
          for (const waitMs of [3000, 8000, 15000]) {
            await new Promise((r) => setTimeout(r, waitMs));
            try {
              const { data } = await api.get<{ accounts?: unknown[] }>(
                `/api/sales/accounts?session_id=${encodeURIComponent(sessionId!)}`,
              );
              const n = data.accounts?.length ?? 0;
              if (n > 0) {
                return {
                  status: 200,
                  summary: `${n} accounts (recovered after client error: ${e instanceof Error ? e.message : String(e)})`,
                };
              }
            } catch {
              /* keep polling */
            }
          }
          throw e;
        }
      }),
    );
    // STOP — no contacts/find force, no sequences send, no email send
    steps.push({
      name: "safe_stop_before_send",
      ok: true,
      ms: 0,
      summary: "harness does not call drafts action=send or email/send",
    });
  }

  async function runMarketingPath(): Promise<void> {
    steps.push(
      await step("distribution_setup", async () => {
        const { data, status } = await api.post<{
          config?: { goal?: string; status?: string; angle?: string };
          source?: string;
          error?: string;
        }>("/api/marketing/distribution/setup", {
          session_id: sessionId,
          action: "recommend",
        });
        if (data.error && !data.config) {
          throw new ApiError(data.error, status, data);
        }
        const goal = data.config?.goal ?? fixture.expected.marketing.goal;
        return {
          status,
          summary: `recommended goal=${goal} source=${data.source ?? "?"}`,
        };
      }),
    );
    if (!steps[steps.length - 1].ok) return;

    steps.push(
      await step("distribution_plan_approve", async () => {
        const { data, status } = await api.post<{
          config?: { status?: string; goal?: string };
          error?: string;
        }>("/api/marketing/distribution/setup", {
          session_id: sessionId,
          action: "approve",
        });
        if (data.error && data.config?.status !== "approved") {
          throw new ApiError(data.error ?? "approve failed", status, data);
        }
        return {
          status,
          summary: `status=${data.config?.status ?? "?"} goal=${data.config?.goal ?? "?"}`,
        };
      }),
    );
    if (!steps[steps.length - 1].ok) return;

    steps.push(
      await step("distribution_research", async () => {
        const { data, status } = await api.post<{
          opportunities?: unknown[];
          error?: string;
          count?: number;
        }>("/api/marketing/distribution/opportunities", {
          session_id: sessionId,
          action: "research",
        });
        const n = data.opportunities?.length ?? data.count ?? 0;
        if (data.error && !n) {
          throw new ApiError(data.error, status, data);
        }
        return { status, summary: `${n} opportunities` };
      }),
    );
    steps.push({
      name: "safe_stop_before_publish",
      ok: true,
      ms: 0,
      summary: "harness does not publish or mark posted",
    });
  }

  async function finalize(): Promise<Scorecard> {
    const endedAt = new Date().toISOString();
    // agent_run_logs inserts are fire-and-forget; wait before collect
    if (sessionId) await new Promise((r) => setTimeout(r, 4000));
    let evidence = await (sessionId
      ? collectEvidence(api, sessionId)
      : Promise.resolve({
          session: null,
          brand: null,
          dossier,
          runLogs: [],
          salesConfig: null,
          segments: null,
          plan: null,
          accounts: [],
          drafts: [],
          distributionConfig: null,
          opportunities: [],
          warnings: ["no session — early abort"],
        }));

    if (!evidence.dossier && dossier) evidence = { ...evidence, dossier };

    const card = scoreRun({
      fixture,
      sessionId,
      // Kami derives Hermes session ids per agent run: kami-<campaign>-<agent>-<run>.
      hermesSessionId: `kami-${sessionId ?? "none"}-*`,
      startedAt,
      endedAt,
      environment: opts.environment,
      baseUrl: opts.baseUrl,
      actualRoute:
        fixture.expected.job_primary === "mixed" && actualRoute === "sales" ? "mixed" : actualRoute,
      steps,
      evidence,
    });

    const failed = steps.filter((s) => !s.ok);
    console.log(
      `→ ${card.passed ? "PASS" : "FAIL"} | steps ${steps.length - failed.length}/${steps.length} | gaps ${card.gaps.length}`,
    );
    for (const s of failed) {
      console.log(`  ✗ ${s.name}: ${s.error}`);
    }
    for (const g of card.gaps) {
      console.log(`  gap [${g.class}/${g.severity}] ${g.symptom}`);
    }
    return card;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const api = new ApiClient(args.baseUrl.replace(/\/$/, ""));
  console.log(`E2E harness → ${api.baseUrl} (${args.environment})`);

  try {
    await preflight(api);
  } catch (e) {
    console.error("Preflight failed:", e instanceof Error ? e.message : e);
    process.exit(2);
  }

  if (args.preflightOnly) {
    console.log("Preflight OK");
    process.exit(0);
  }

  const fixtures = selectFixtures(loadFixtures(), args.fixtures);
  console.log(`Running ${fixtures.length} fixture(s): ${fixtures.map((f) => f.id).join(", ")}`);

  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const cards: Scorecard[] = [];

  for (const fixture of fixtures) {
    const card = await runFixture(api, fixture, {
      environment: args.environment,
      baseUrl: api.baseUrl,
    });
    cards.push(card);
    appendGaps(gapLogPath(E2E_DIR), card);

    if (args.keepResults) {
      const out = join(RESULTS_DIR, `${fixture.id}-${stamp}.json`);
      writeFileSync(out, JSON.stringify(card, null, 2), "utf8");
      console.log(`  wrote ${out}`);
    }
  }

  const reportPath = join(RESULTS_DIR, `summary-${stamp}.md`);
  writeAggregateReport(reportPath, cards);
  console.log(`\nAggregate: ${reportPath}`);
  console.log(`Pass rate: ${cards.filter((c) => c.passed).length}/${cards.length}`);

  const anyFail = cards.some((c) => !c.passed);
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
