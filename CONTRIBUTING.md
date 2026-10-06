# Contributing to Kami

Keep PRs small and easy to review. Skim [README.md](README.md) and [AGENTS.md](AGENTS.md) if you touch agents, skills, or product behavior.

## CLA (required)

Every human contributor must sign the [Contributor License Agreement](CLA.md) on their pull request by commenting:

```text
I have read the CLA Document and I hereby sign the CLA
```

You keep copyright. The grant lets Kami keep Community Edition MIT and, if maintainers later ship Enterprise, relicense the same contributions. Sign once per GitHub user; the bot stores it on the `cla-signatures` branch. Bots are allowlisted. Maintainers (`@saranambiar`, `@VaradDurge`) sign once too.

Comment `recheck` if the CLA check is stale.

## Reviews

PRs need **one approving review from the other maintainer** (GitHub will not let you approve your own PR). [CODEOWNERS](.github/CODEOWNERS) lists both. Open PRs against **`dev`**.

## Product contract

Read [docs/product-loops.md](docs/product-loops.md) first. UX must stay simple: domain → confirm dossier → **Find customers** or **Create distribution** → small approved batches.

Non-negotiables:

- Hermes is the agent backend — do not replace it with a custom LLM wrapper.
- Real surfaces only for “done” claims (email send, X publish). No mocked CRM as proof.
- Never invent emails. Role/shared inboxes (`press@`, `privacy@`, `hello@`) are found-but-not-sendable.
- Founder approval, kill switch, and stop-before-send stay intact.
- Community Edition = self-hosted BYOK. Do not hard-require a hosted Kami API.
- Prefer skills (`SKILL.md`) over hardcoded playbook prompts in routes.

Agent behaviour lives in [`agents/`](agents/) (one role prompt per agent, registered in `web/lib/hermes/agents.ts`) and [`skills/`](skills/) — not in route code. Kami Guide's voice is in [`agents/guide.md`](agents/guide.md); keep answers short.

## Local setup

Follow **[SETUP.md](SETUP.md)** (Hermes + Supabase + migrations `001`–`018`). BYOK detail and copy-paste agent setup prompts: [docs/community-edition.md](docs/community-edition.md).

```bash
cd web && npm install && cp .env.example .env.local   # fill in the Required block
cd .. && npm run sync:skills && npm run readiness
hermes gateway run                                    # terminal A
npm run dev                                           # terminal B → http://localhost:3000
```

Verify `GET /api/capabilities` reports `hermes` and `database` before filing setup issues.

A fully local stack works too: `supabase start` from `web/` applies every migration to a local Postgres.

## Agent-assisted setup

Prefer the one-shot prompts in [docs/community-edition.md](docs/community-edition.md) (from-scratch clone, or already-cloned). Require confirmation before writing secrets, applying SQL, or calling external providers.

## Scope notes

- Marketing CRM / cold DMs stay Advanced — do not make them the default journey.
- Activity (`/activity`) is the one place for receipts, agent runs and the suppression list.
- Hosted multi-tenant auth is out of scope: Community Edition is single-user.

## Branch layout

| Branch | Role |
|--------|------|
| **`main`** | Public default. Clone target. Release tags (`v0.x.y`). |
| **`dev`** | Integration. **Open PRs against `dev`.** |
| **`feature/…`** | Contributor work. |

```text
git clone https://github.com/kami-community/kami.git
git checkout dev && git pull
git checkout -b feature/short-name
# work → push → open PR with base = dev
```

GitHub often suggests `main` as the PR base — **always set the base to `dev`**.

Maintainers: merge reviewed PRs into `dev`; promote `dev` → `main` when stable; tag releases on `main`. Hotfixes: `fix/…` → PR → `main`, then back-merge into `dev`.

Community Edition is **self-hosted / localhost**. Do not re-wire auto-deploy to trykami.app / Vercel as the product surface.

## How to contribute

### Product / UX

- Keep Domain → That’s us → Find customers / Create distribution.
- Sales: segments → plan → find → emails (no auto-send).
- Marketing: distribution opportunity queue first; CRM / cold DMs stay Advanced / later.
- One primary Hanko-red CTA per screen.

### Skills & research

- Add/improve GTM playbooks under `skills/` (outreach, distribution platforms).
- Source-backed product truth (cite URLs). Do not hardcode fixture greens.
- Bind Marketing opportunities to real thread URL + evidence + draft continuity.
- Bind Sales accounts to segment + signal + source; do not Tier-1 on generic mentions.

### Evals

- Extend the gold corpus / `web/evals/e2e/fixtures/companies.json` carefully.
- Run `npm run eval:sales` and `npm run eval:e2e`. Append to `GAPLOG.md` — never delete failing fixtures to go green.
- Hard gates stay strict (identity, no-send, PLG honesty, scaffold ≠ researched when Hermes is up).

### Observability (first-class)

- Every Hermes call goes through `web/lib/hermes/client.ts`, which logs it to `agent_run_logs` (shown in Activity → Agent runs). New agent step → new `kind`.
- Every send, post and DM records an `outbound_receipts` row with the provider id (Activity → Outbound).
- Map missing-table errors to founder-facing copy.
- Goal: reconstruct dossier → plan → discover/opps → review → external action from logs alone.
- Future: manager decision artifacts (recommended job, rationale, rejected alternative) and review/revision events.

### Integrations

- **Email / research:** AgentMail (human-gated send), Linkup / first-party domain evidence, optional browser CDP. Use the capability registry; degrade gracefully.
- **Social / distribution:** X (plain-text publish when connected), Reddit / LinkedIn / HN / Product Hunt / Discord as opportunity surfaces via skills.
- New vendor = an adapter in `web/lib/adapters/` behind a port in `web/lib/ports/`, selected in `web/lib/providers.ts`. Services never import vendors directly.
- New platform = skill + opportunity contract (URL, evidence, why_now, draft, risks) + an approval path through `web/lib/outbound/` that records `published_url` / outcome.
- Value-first, no spam, no inventing “we posted.” Manual/controlled publish until the automated path is proven.
- Prefer distribution opportunities over cold DMs as the default Marketing path.

## Roadmap

- Desktop packaging — guided BYOK, Hermes + DB health checks.
- Memory / personalization — preferences and prior outcomes across campaigns.
- Kanban / Hermes task surfacing in Activity.
- Richer social adapters (Discord, Reddit) — skill-first, behind ports.
- Eval corpus growth in CI.

## Good first contributions

- One new or tighter E2E fixture + gold notes.
- One platform or outreach `SKILL.md` improvement with sources.
- One missing `agent_run_logs` kind on an existing route.
- One capability + graceful-empty state for an integration.
- Docs: SETUP edge cases (Windows Hermes home, Supabase CLI).

## Checks before PR

```bash
cd web
npm run lint && npm run typecheck && npm test && npm run eval:sales && npm run format:check && npm run build
cd .. && npm run check:skills
```

CI runs the same gates plus a secret scan. When touching Marketing or Sales flows, also run a focused `npm run eval:e2e -- --fixture …`.

- [ ] Branched from `dev` (PR base = `dev`)
- [ ] Change is scoped (one concern)
- [ ] Real-surface behavior still real
- [ ] PR description: **what**, **why**, **how to verify**
- [ ] CLA signed on the PR (see above)
- [ ] No secrets committed

## What we will reject

- PRs that weaken safety or evals to raise pass rate.
- Mocked send/publish presented as real execution.
- Custom agent framework replacing Hermes.
- Consumer email blast paths for PLG/D2C products.
- Scaffold opportunities labeled as researched when Hermes was available.

## Agent-assisted changes

Use the prompts in [docs/community-edition.md](docs/community-edition.md). Require confirmation before writing secrets, CDP config, applying migrations, or calling external providers.
