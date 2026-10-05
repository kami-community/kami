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

Ask Kami style lives in [`web/lib/prompts.ts`](web/lib/prompts.ts) (`cmoPrompt`) — keep answers short (≤120 words by default).

## Local setup

Follow the minimal path in **[SETUP.md](SETUP.md)** (Hermes + Supabase + migrations `001`–`012`).

BYOK detail and **copy-paste agent setup prompts**: [docs/community-edition.md](docs/community-edition.md).

```bash
cd web
npm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
cd ..
npm run sync:skills
npm run readiness
# Start Hermes gateway on :8642, then:
cd web
npm run dev
```

Verify `/api/capabilities` shows `hermes` + `database` before filing setup issues.

## Agent-assisted setup

Prefer the one-shot prompts in [docs/community-edition.md](docs/community-edition.md) (from-scratch clone, or already-cloned). Require confirmation before writing secrets, applying SQL, or calling external providers.

## Scope notes

- Board / Ledger / CRM **routes** may exist for maintainers; they are **not** in the default founder navigation.
- Marketing CRM / cold DMs stay Advanced / later — do not make them the default journey.
- Desktop packaging and hosted multi-tenant auth are post-MVP (see Roadmap).

## Branch layout

| Branch | Role |
|--------|------|
| **`main`** | Public default. Clone target. Release tags (`v0.x.y`). |
| **`dev`** | Integration. **Open PRs against `dev`.** |
| **`feature/…`** | Contributor work. |

```text
git clone https://github.com/saranambiar/kami.git
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

- Every meaningful hop should land in `agent_run_logs` with `kamiSessionId` + `kind`.
- Prefer chokepoint logging (Hermes chat + pipeline routes) over silent one-offs.
- New specialist/action → new log `kind` (+ Ledger/UI surfacing when useful).
- Map missing-table errors to founder-facing copy.
- Goal: reconstruct dossier → plan → discover/opps → review → external action from logs alone.
- Future: manager decision artifacts (recommended job, rationale, rejected alternative) and review/revision events.

### Integrations

- **Email / research:** AgentMail (human-gated send), Linkup / first-party domain evidence, optional browser CDP. Use the capability registry; degrade gracefully.
- **Social / distribution:** X (plain-text publish when connected), Reddit / LinkedIn / HN / Product Hunt / Discord as opportunity surfaces via skills.
- New platform = skill + opportunity contract (URL, evidence, why_now, draft, risks) + approval path that records `published_url` / outcome.
- Value-first, no spam, no inventing “we posted.” Manual/controlled publish until the automated path is proven.
- Prefer distribution opportunities over cold DMs as the default Marketing path.

## Roadmap

- Desktop app — easy local packaging, guided BYOK, Hermes + DB health checks.
- Memory / personalization — prefs, suppressions, prior contacts/outcomes across runs.
- Kanban / Hermes task surfacing — show manager + specialist work in flight (tied to run logs).
- CRM — accounts, contacts, sequences, replies, stages (never invent contacts).
- Richer social adapters — Instagram, Discord bots, etc., skill-first.
- Manager orchestration provenance — decision + review bounce before external action.
- Eval CI / corpus growth.

Board, Ledger, and CRM pages may exist in the repo for maintainers but are **not** part of the default founder navigation. Do not re-add them to primary nav without a product decision.

## Good first contributions

- One new or tighter E2E fixture + gold notes.
- One platform or outreach `SKILL.md` improvement with sources.
- One missing `agent_run_logs` kind on an existing route.
- One capability + graceful-empty state for an integration.
- Docs: SETUP edge cases (Windows Hermes home, migrations 009/010).

## Checks before PR

```bash
npm run eval:sales
npm run build
```

When touching Marketing or Sales flows, also run a focused `npm run eval:e2e -- --fixture …`.

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
