# Kami E2E evaluation harness

API-scripted founder path over fixtures in `fixtures/companies.json`. No Playwright. No email send. No publish.

**No affiliation:** Names like cal.com / notion.so / nike.in in fixtures are **test cases only**. Kami has no partnership with those companies. See [`fixtures/NOTICE.md`](fixtures/NOTICE.md).

## Prerequisites

1. Web app running (`npm run dev` from repo root) with Supabase + Hermes configured
2. Migrations through **`011_distribution_plan.sql`** (includes **`009`** / **`010`** for Marketing + logs)
3. Hermes gateway reachable (`/api/capabilities` shows `hermes: true`)

## Commands

From `web/`:

```bash
npm run eval:e2e -- --preflight
npm run eval:e2e -- --fixture argus
npm run eval:e2e -- --fixture mirage,nike-in
npm run eval:e2e -- --all --base-url http://localhost:3000 --environment local
```

From repo root:

```bash
npm run eval:e2e -- --fixture cal
```

| Flag                 | Meaning                                             |
| -------------------- | --------------------------------------------------- |
| `--all`              | All fixtures in `fixtures/companies.json` (default) |
| `--fixture id[,id…]` | Subset                                              |
| `--base-url`         | Target Kami origin (local or staging)               |
| `--environment`      | Label written into scorecards (`local` / `staging`) |
| `--preflight`        | Capabilities check only                             |
| `--no-keep-results`  | Skip writing `results/*.json`                       |

## Path & safety boundary

```text
domain validate → research → session → dossier/generate
  → Sales: setup → segments derive/confirm → plan → approve → discover → STOP
  → Marketing: distribution recommend → plan approve → opportunities research → STOP
```

Never calls `drafts` send, `/api/email/send`, or distribution publish actions.

## Artifacts

| Path                          | Purpose                                   |
| ----------------------------- | ----------------------------------------- |
| `results/<fixture>-<ts>.json` | Per-run scorecard (gitignored)            |
| `results/summary-<ts>.md`     | Aggregate pass rate                       |
| `GAPLOG.md`                   | Durable failures + RCA fields (local, gitignored) |

## Scoring

Hard gates (see `lib/score.ts`): identity lock, evidence grounding, route safety, contact safety / no send, PLG honesty, observability chain (`agent_run_logs` kinds).

RCA classes: `patch` · `prompt_skill` · `architecture` · `data_research` · `environment`.

## Iteration

1. Fix from GAPLOG (highest leverage class first)
2. Re-run failed fixtures, then full corpus after architecture/prompt changes
3. Never delete a failing fixture to go green — mark `wontfix` with reason if needed

Offline unit evals remain separate: `npm run eval:sales`.
