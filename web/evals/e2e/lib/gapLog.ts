import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GapEntry, Scorecard } from "./types";

const HEADER = `# E2E GAPLOG

Durable gap log for multi-company Kami E2E runs. Append-only; do not delete failing fixtures to go green.

| Date | Fixture | Class | Severity | Symptom | Status |
|------|---------|-------|----------|---------|--------|

`;

export function ensureGapLog(path: string): void {
  if (!existsSync(path)) {
    writeFileSync(path, HEADER, "utf8");
  }
}

export function appendGaps(gapLogPath: string, scorecard: Scorecard): void {
  ensureGapLog(gapLogPath);
  if (!scorecard.gaps.length) return;

  const date = new Date().toISOString().slice(0, 10);
  const blocks = scorecard.gaps.map((g) => formatGapMarkdown(date, g, scorecard));
  appendFileSync(gapLogPath, `\n${blocks.join("\n")}\n`, "utf8");
}

function formatGapMarkdown(date: string, g: GapEntry, sc: Scorecard): string {
  return `## ${date} · ${g.fixture_id} · ${g.class}

| Field | Value |
|-------|-------|
| Severity | ${g.severity} |
| Status | ${g.status} |
| Session | \`${g.session_id ?? "n/a"}\` |
| Run logs | ${g.run_log_ids.map((id) => `\`${id}\``).join(", ") || "n/a"} |
| Environment | ${sc.environment} @ ${sc.base_url} |

**Symptom:** ${g.symptom}

**Expected:** ${g.expected}

**Actual:** ${g.actual}

**Evidence:** ${g.evidence}

**Next action:** ${g.next_action}

**Human RCA review:** _(fill after triage — confirm class / wontfix reason)_
`;
}

export function writeAggregateReport(outPath: string, cards: Scorecard[]): void {
  const passed = cards.filter((c) => c.passed).length;
  const lines = [
    `# E2E corpus report`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `**Pass rate:** ${passed}/${cards.length}`,
    ``,
    `| Fixture | Route | Passed | Failed gates | Gaps |`,
    `|---------|-------|--------|--------------|------|`,
    ...cards.map((c) => {
      const failed = Object.entries(c.hard_gates)
        .filter(([, v]) => v === "fail")
        .map(([k]) => k)
        .join(", ");
      return `| ${c.fixture_id} | ${c.route.actual} | ${c.passed ? "yes" : "no"} | ${failed || "—"} | ${c.gaps.length} |`;
    }),
    ``,
    `## Per-fixture notes`,
    ``,
  ];

  for (const c of cards) {
    lines.push(`### ${c.fixture_id} (\`${c.canonical_domain}\`)`);
    lines.push(``);
    lines.push(`- Session: \`${c.session_id ?? "n/a"}\``);
    lines.push(`- Expected job: ${c.route.expected} → actual ${c.route.actual}`);
    lines.push(`- Steps: ${c.steps.filter((s) => s.ok).length}/${c.steps.length} ok`);
    if (c.gaps.length) {
      lines.push(`- Gaps:`);
      for (const g of c.gaps) {
        lines.push(`  - **[${g.class}/${g.severity}]** ${g.symptom}`);
      }
    } else {
      lines.push(`- Gaps: none`);
    }
    lines.push(``);
  }

  writeFileSync(outPath, lines.join("\n"), "utf8");
}

export function readExistingGapLog(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function gapLogPath(e2eDir: string): string {
  return join(e2eDir, "GAPLOG.md");
}
