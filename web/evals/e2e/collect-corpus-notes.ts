/**
 * Collect dossier / run-log / sales / marketing evidence for the 8 completed
 * E2E fixtures and write a comparison markdown.
 *
 * Usage: npx tsx evals/e2e/collect-corpus-notes.ts
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(__dirname, "results");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const FIXTURES = [
  "mirage",
  "argus",
  "cal",
  "nike-in",
  "linear",
  "browserbase",
  "notion",
  "duolingo",
] as const;

type AnyRec = Record<string, unknown>;

function latestPass(id: string): { file: string; card: AnyRec } | null {
  const files = readdirSync(RESULTS)
    .filter((f) => f.startsWith(`${id}-`) && f.endsWith(".json") && !f.includes("corpus"))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const card = JSON.parse(readFileSync(join(RESULTS, files[i]), "utf8")) as AnyRec;
    if (card.passed) return { file: files[i], card };
  }
  return null;
}

async function get(path: string): Promise<AnyRec> {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as AnyRec;
  } catch {
    return { raw: text.slice(0, 500), status: res.status };
  }
}

function clip(s: unknown, n = 220): string {
  const t = typeof s === "string" ? s : s == null ? "" : JSON.stringify(s);
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function mdEscape(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function main(): Promise<void> {
  mkdirSync(RESULTS, { recursive: true });
  const collected: AnyRec[] = [];

  for (const id of FIXTURES) {
    const hit = latestPass(id);
    if (!hit) {
      collected.push({ id, error: "no passing scorecard" });
      console.error("skip", id);
      continue;
    }
    const sid = String(hit.card.session_id);
    console.log("collect", id, sid);

    const [sessionPack, runs, accounts, drafts, distSetup, opps, salesSetup, plan, segments] =
      await Promise.all([
        get(`/api/sessions/${sid}`),
        get(`/api/observability/runs?session_id=${encodeURIComponent(sid)}&limit=100`),
        get(`/api/sales/accounts?session_id=${encodeURIComponent(sid)}`),
        get(`/api/sales/drafts?session_id=${encodeURIComponent(sid)}`),
        get(`/api/marketing/distribution/setup?session_id=${encodeURIComponent(sid)}`),
        get(`/api/marketing/distribution/opportunities?session_id=${encodeURIComponent(sid)}`),
        get(`/api/sales/setup?session_id=${encodeURIComponent(sid)}`),
        get(`/api/sales/plan?session_id=${encodeURIComponent(sid)}`),
        get(`/api/sales/segments?session_id=${encodeURIComponent(sid)}`).catch(
          () => ({}) as AnyRec,
        ),
      ]);

    const brand = (sessionPack.brand ?? null) as AnyRec | null;
    const dossier = (brand?.raw_dossier ?? null) as AnyRec | null;
    const runList = (runs.runs as AnyRec[] | undefined) ?? [];
    const accountList = (accounts.accounts as AnyRec[] | undefined) ?? [];
    const oppList = (opps.opportunities as AnyRec[] | undefined) ?? [];
    const steps = (hit.card.steps as AnyRec[] | undefined) ?? [];

    const kinds = [...new Set(runList.map((r) => String(r.kind)))];
    const byKind: Record<string, AnyRec[]> = {};
    for (const k of kinds) {
      byKind[k] = runList
        .filter((r) => r.kind === k)
        .map((r) => ({
          status: r.status,
          agent: r.agent,
          duration_ms: r.duration_ms,
          preview: clip(r.output_text, 320),
        }));
    }

    collected.push({
      id,
      file: hit.file,
      session_id: sid,
      scorecard: {
        route: hit.card.route,
        hard_gates: hit.card.hard_gates,
        steps_ok: steps.filter((s) => s.ok).length,
        steps_total: steps.length,
        steps: steps.map((s) => ({
          name: s.name,
          ok: s.ok,
          ms: s.ms,
          summary: s.summary ?? s.error ?? null,
        })),
      },
      session: {
        domain: (sessionPack.session as AnyRec | undefined)?.domain,
        canonical_domain: (sessionPack.session as AnyRec | undefined)?.canonical_domain,
      },
      dossier: dossier
        ? {
            company: dossier.company,
            positioning: dossier.positioning,
            product_category: dossier.product_category,
            brand_voice: dossier.brand_voice,
            industries: dossier.industries,
            personas: dossier.personas,
            geos: dossier.geos,
            icp_buckets: ((dossier.icp_buckets as AnyRec[]) || []).map((b) => ({
              label: b.label,
              angle: b.angle,
              est_size: b.est_size,
              trigger_signal: b.trigger_signal,
            })),
            opportunities: ((dossier.opportunities as AnyRec[]) || []).map((o) => ({
              title: o.title,
              playbook: o.playbook,
              detail: clip(o.detail, 200),
            })),
            competitors: ((dossier.competitor_analysis as unknown[]) || [])
              .slice(0, 6)
              .map((c) => (typeof c === "string" ? c : (c as AnyRec).name)),
          }
        : null,
      run_logs: { count: runList.length, kinds, by_kind: byKind },
      sales: {
        config: salesSetup.config
          ? {
              offer: clip((salesSetup.config as AnyRec).offer, 240),
              icp: (salesSetup.config as AnyRec).icp,
              segments_confirmed_at: (salesSetup.config as AnyRec).segments_confirmed_at,
            }
          : null,
        segments: ((segments as AnyRec).segments as unknown[]) ?? null,
        plan: plan.plan
          ? {
              id: (plan.plan as AnyRec).id,
              status: (plan.plan as AnyRec).status,
              motions: (plan.plan as AnyRec).motions,
              channel_rationale: clip((plan.plan as AnyRec).channel_rationale, 280),
              risks: (plan.plan as AnyRec).risks,
              tiers: ((plan.plan as AnyRec).tiers as unknown[])?.slice?.(0, 4) ?? null,
            }
          : null,
        account_count: accountList.length,
        accounts: accountList.slice(0, 15).map((a) => ({
          name: a.name,
          domain: a.domain,
          tier: a.tier,
          industry: a.industry,
          contact: (a.contact as AnyRec | null)?.email ?? null,
        })),
        drafts: ((drafts.drafts as unknown[]) || []).length,
      },
      marketing: {
        config: distSetup.config ?? null,
        opportunity_count: oppList.length,
        opportunities: oppList.slice(0, 10).map((o) => ({
          platform: o.platform,
          why_now: clip(o.why_now, 200),
          suggested_action: o.suggested_action,
          draft: clip(o.draft, 220),
          source_url: o.source_url,
          approval_status: o.approval_status,
          action_status: o.action_status,
        })),
      },
    });
  }

  writeFileSync(join(RESULTS, "corpus-8-snapshot.json"), JSON.stringify(collected, null, 2));

  const lines: string[] = [];
  lines.push("# E2E corpus output notes — first 8 fixtures");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(
    "Comparison of **passing** runs for mirage, argus, cal, nike-in, linear, browserbase, notion, duolingo. Evidence pulled from harness scorecards + live Supabase-backed APIs (`agent_sessions`, `brand_profiles`, `agent_run_logs`, sales_*, distribution_*).",
  );
  lines.push("");
  lines.push("Still outstanding in corpus: `supabase`, `arc`.");
  lines.push("");
  lines.push("## 1. Scorecard summary");
  lines.push("");
  lines.push("| Fixture | Domain | Route | Steps | Gates | Session |");
  lines.push("|---------|--------|-------|-------|-------|---------|");
  for (const row of collected) {
    if (row.error) {
      lines.push(`| ${row.id} | — | — | — | ERROR | — |`);
      continue;
    }
    const route = row.scorecard as AnyRec;
    const r = route.route as AnyRec;
    const session = row.session as AnyRec;
    const gates = Object.entries((route.hard_gates as AnyRec) || {})
      .filter(([, v]) => v === "fail")
      .map(([k]) => k);
    lines.push(
      `| ${row.id} | ${session.canonical_domain || session.domain || "?"} | ${r.expected} → **${r.actual}** | ${route.steps_ok}/${route.steps_total} | ${gates.length ? gates.join(", ") : "all pass"} | \`${row.session_id}\` |`,
    );
  }
  lines.push("");
  lines.push("## 2. Observability (`agent_run_logs`)");
  lines.push("");
  lines.push("| Fixture | # logs | Kinds present |");
  lines.push("|---------|--------|---------------|");
  for (const row of collected) {
    if (row.error) continue;
    const rl = row.run_logs as AnyRec;
    lines.push(`| ${row.id} | ${rl.count} | ${(rl.kinds as string[]).join(", ")} |`);
  }
  lines.push("");
  lines.push("## 3. Dossier outputs (what Hermes / onboarding produced)");
  lines.push("");

  for (const row of collected) {
    if (row.error) continue;
    const d = row.dossier as AnyRec | null;
    const session = row.session as AnyRec;
    lines.push(`### ${row.id} (\`${session.canonical_domain || session.domain}\`)`);
    lines.push("");
    if (!d) {
      lines.push("_No dossier in `brand_profiles.raw_dossier`._");
      lines.push("");
      continue;
    }
    lines.push(`- **Company:** ${d.company}`);
    lines.push(`- **Category:** ${d.product_category ?? "—"}`);
    lines.push(`- **Brand voice:** ${clip(d.brand_voice, 160)}`);
    lines.push(`- **Positioning:** ${clip(d.positioning, 360)}`);
    lines.push(
      `- **Industries:** ${Array.isArray(d.industries) ? (d.industries as string[]).join(", ") : "—"}`,
    );
    lines.push(
      `- **Personas:** ${Array.isArray(d.personas) ? (d.personas as string[]).join("; ") : "—"}`,
    );
    lines.push(`- **Geos:** ${Array.isArray(d.geos) ? (d.geos as string[]).join(", ") : "—"}`);
    lines.push(
      `- **Competitors:** ${Array.isArray(d.competitors) ? (d.competitors as string[]).filter(Boolean).join(", ") : "—"}`,
    );
    lines.push("");
    lines.push("**ICP buckets**");
    lines.push("");
    for (const b of (d.icp_buckets as AnyRec[]) || []) {
      lines.push(
        `- **${b.label}** — ${clip(b.angle, 160)} _(size: ${b.est_size || "?"}; trigger: ${clip(b.trigger_signal, 80)})_`,
      );
    }
    lines.push("");
    lines.push("**Dossier opportunities (onboarding, not Marketing queue)**");
    lines.push("");
    for (const o of (d.opportunities as AnyRec[]) || []) {
      lines.push(`- **${o.title}** [\`${o.playbook}\`] — ${clip(o.detail, 180)}`);
    }
    lines.push("");

    const byKind = (row.run_logs as AnyRec).by_kind as Record<string, AnyRec[]>;
    const dossierLogs = byKind.dossier_research || [];
    if (dossierLogs.length) {
      lines.push("<details><summary>dossier_research log preview</summary>");
      lines.push("");
      lines.push("```");
      lines.push(String(dossierLogs[0]?.preview || ""));
      lines.push("```");
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }
  }

  lines.push("## 4. Sales path outputs (B2B / mixed)");
  lines.push("");
  lines.push(
    "Fixtures that took Sales: argus, cal, linear, browserbase, notion. (mirage/nike-in/duolingo = Marketing.)",
  );
  lines.push("");

  for (const id of ["argus", "cal", "linear", "browserbase", "notion"]) {
    const row = collected.find((r) => r.id === id);
    if (!row || row.error) continue;
    const sales = row.sales as AnyRec;
    lines.push(`### ${id}`);
    lines.push("");
    if (!sales.config) {
      lines.push("_No sales campaign._");
      lines.push("");
      continue;
    }
    lines.push(`- **Offer:** ${clip((sales.config as AnyRec).offer, 280)}`);
    lines.push(`- **ICP:** \`${JSON.stringify((sales.config as AnyRec).icp)}\``);
    lines.push(`- **Segments confirmed:** ${(sales.config as AnyRec).segments_confirmed_at || "—"}`);
    if (sales.plan) {
      const p = sales.plan as AnyRec;
      lines.push(`- **Plan status:** ${p.status}`);
      lines.push(`- **Channel rationale:** ${clip(p.channel_rationale, 280)}`);
      lines.push(`- **Risks:** ${Array.isArray(p.risks) ? (p.risks as string[]).join("; ") : "—"}`);
    }
    lines.push(`- **Accounts found:** ${sales.account_count}`);
    lines.push("");
    if ((sales.accounts as AnyRec[]).length) {
      lines.push("| Company | Domain | Tier | Contact email |");
      lines.push("|---------|--------|------|---------------|");
      for (const a of sales.accounts as AnyRec[]) {
        lines.push(
          `| ${mdEscape(String(a.name))} | ${a.domain || "—"} | ${a.tier ?? "—"} | ${a.contact || "—"} |`,
        );
      }
      lines.push("");
    }
    const byKind = (row.run_logs as AnyRec).by_kind as Record<string, AnyRec[]>;
    for (const kind of ["sales_segments", "sales_plan", "sales_discover"]) {
      const logs = byKind[kind];
      if (!logs?.length) continue;
      lines.push(`<details><summary>${kind} preview</summary>`);
      lines.push("");
      lines.push("```");
      lines.push(String(logs[0].preview || ""));
      lines.push("```");
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }
  }

  lines.push("## 5. Marketing / distribution outputs (PLG·D2C)");
  lines.push("");

  for (const id of ["mirage", "nike-in", "duolingo"]) {
    const row = collected.find((r) => r.id === id);
    if (!row || row.error) continue;
    const m = row.marketing as AnyRec;
    lines.push(`### ${id}`);
    lines.push("");
    const cfg = m.config as AnyRec | null;
    lines.push(
      `- **Goal:** ${cfg?.goal ?? "—"} · **Angle:** ${clip(cfg?.angle, 200)} · **Surfaces:** ${Array.isArray(cfg?.surfaces) ? (cfg!.surfaces as string[]).join(", ") : "—"}`,
    );
    lines.push(`- **Opportunities:** ${m.opportunity_count}`);
    lines.push("");
    if ((m.opportunities as AnyRec[]).length) {
      lines.push("| Platform | Why now | Action | Draft (clip) | URL |");
      lines.push("|----------|---------|--------|--------------|-----|");
      for (const o of m.opportunities as AnyRec[]) {
        lines.push(
          `| ${o.platform} | ${mdEscape(clip(o.why_now, 120))} | ${o.suggested_action} | ${mdEscape(clip(o.draft, 100))} | ${o.source_url || "—"} |`,
        );
      }
      lines.push("");
    }
    const byKind = (row.run_logs as AnyRec).by_kind as Record<string, AnyRec[]>;
    for (const kind of ["distribution_research", "distribution_opportunities"]) {
      const logs = byKind[kind];
      if (!logs?.length) continue;
      lines.push(`<details><summary>${kind} preview</summary>`);
      lines.push("");
      lines.push("```");
      lines.push(String(logs[0].preview || ""));
      lines.push("```");
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }
  }

  lines.push("## 6. Cross-cutting observations (for later RCA / gold compare)");
  lines.push("");
  lines.push(
    "Hard gates already passed; these are qualitative notes from the pulled outputs.",
  );
  lines.push("");

  // Auto observations
  const salesRows = collected.filter((r) =>
    ["argus", "cal", "linear", "browserbase", "notion"].includes(String(r.id)),
  );
  const mktRows = collected.filter((r) =>
    ["mirage", "nike-in", "duolingo"].includes(String(r.id)),
  );

  lines.push("### Identity / dossier");
  lines.push("");
  for (const row of collected) {
    if (row.error || !row.dossier) continue;
    const d = row.dossier as AnyRec;
    lines.push(
      `- **${row.id}:** positioned as “${clip(d.positioning, 140)}” · category \`${d.product_category ?? "?"}\``,
    );
  }
  lines.push("");
  lines.push("### Sales discover quality");
  lines.push("");
  for (const row of salesRows) {
    const sales = row.sales as AnyRec;
    const withEmail = ((sales.accounts as AnyRec[]) || []).filter((a) => a.contact).length;
    lines.push(
      `- **${row.id}:** ${sales.account_count} accounts, ${withEmail} with contact email on record (harness stopped before send)`,
    );
  }
  lines.push("");
  lines.push("### Marketing opportunity quality");
  lines.push("");
  for (const row of mktRows) {
    const m = row.marketing as AnyRec;
    const platforms = [
      ...new Set(((m.opportunities as AnyRec[]) || []).map((o) => String(o.platform))),
    ];
    lines.push(
      `- **${row.id}:** ${m.opportunity_count} opportunities across [${platforms.join(", ") || "—"}]; none marked published (safe stop)`,
    );
  }
  lines.push("");
  lines.push("### Suggested next analysis questions");
  lines.push("");
  lines.push("1. Do B2B account lists avoid listicles/publishers (spot-check domains against gold `must_not`)?");
  lines.push("2. For argus — is biomedical language absent from dossier + segments?");
  lines.push("3. For mirage/arc-class PLG — is distribution honestly preferred over inventing consumer emails?");
  lines.push("4. For notion (mixed) — are segments overfitted to one niche or appropriately broad?");
  lines.push("5. Are distribution drafts specific (why_now + URL) or generic engagement bait?");
  lines.push("");
  lines.push("## 7. Artifact index");
  lines.push("");
  lines.push("| Fixture | Scorecard file | Snapshot key |");
  lines.push("|---------|----------------|--------------|");
  for (const row of collected) {
    if (row.error) continue;
    lines.push(`| ${row.id} | \`${row.file}\` | session \`${row.session_id}\` |`);
  }
  lines.push("");
  lines.push("Machine-readable dump: `web/evals/e2e/results/corpus-8-snapshot.json`.");
  lines.push("");
  lines.push("Related: [GAPLOG.md](./GAPLOG.md) · fixtures in `fixtures/companies.json`.");
  lines.push("");

  const outMd = join(__dirname, "CORPUS-8-OUTPUT-NOTES.md");
  writeFileSync(outMd, lines.join("\n"), "utf8");
  console.log("wrote", outMd);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
