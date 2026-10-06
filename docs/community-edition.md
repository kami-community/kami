# Kami Community Edition

Self-hosted, BYOK, single-user. Clone the repo, bring your own keys and Supabase project, run Hermes locally, open Kami at `http://localhost:3000`.

Kami does **not** host your agents, pay for your model tokens, or store your secrets.

Step-by-step: **[SETUP.md](../SETUP.md)**. Overview: **[README.md](../README.md)**.

## What you get

- Domain → dossier → confirm → **Find customers** or **Create distribution**
- Sales: segment → plan → find → reviewed email → Needs you
- Marketing: goal → opportunity queue (X publish when connected; other platforms research/manual)
- Kami Guide: short answers grounded in campaign state
- Research: first-party domain · optional Linkup/Exa/Tavily · optional Chrome CDP

## Agent-assisted setup prompts

### A. From scratch (clone + run)

```text
Set up Kami Community Edition on this machine end-to-end.

Product: self-hosted BYOK GTM app. Hermes is the agent backend (gateway :8642). Next.js UI is in web/. Clone https://github.com/kami-community/kami.git (branch main) and open it as the workspace.

Read first: README.md, SETUP.md, docs/community-edition.md, web/.env.example, root .env.example.

Do:
1) Install Hermes if missing. Enable API server on 127.0.0.1:8642. Hermes home is ~/.hermes on macOS/Linux and %LOCALAPPDATA%\hermes on Windows. Ask me for the model key and API_SERVER_KEY; never print or commit secrets.
2) Create or connect my Supabase project. Apply migrations in web/supabase/migrations/ in order: 001–018 (or `supabase db push` from web/). Confirm before running SQL.
3) Write web/.env.local from web/.env.example (not root .env.example) with HERMES_GATEWAY_URL=http://127.0.0.1:8642/v1/chat/completions, HERMES_API_KEY matching API_SERVER_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Leave AgentMail, X, Linkup/Exa/Tavily, CDP unset unless I provide them.
4) npm install in web/. From repo root: npm run sync:skills && npm run readiness.
5) Start the Hermes gateway (`hermes gateway run`), then `npm run dev` in web/.
6) Verify GET http://localhost:3000/api/capabilities reports hermes + database. Fix blockers until true.
7) Report what is unlocked vs optional, and the first click path: domain → That’s us → Find customers or Create distribution.

Rules: Community Edition is local only — do not require trykami.app. Never invent emails, auto-send, or publish. Ask before writing config, applying SQL, CDP, or external APIs.
```

### B. Already cloned (this repo)

```text
Help me set up Kami Community Edition in this already-cloned repository.

Read SETUP.md, docs/community-edition.md, web/.env.example, root .env.example. Never print or commit secrets.

Target state:
- Hermes API server on 127.0.0.1:8642 with my model key (Hermes home: ~/.hermes, or %LOCALAPPDATA%\hermes on Windows)
- Supabase migrations 001–018 applied
- web/.env.local from web/.env.example: Hermes gateway URL + matching API key + Supabase URL + service role only
- AgentMail, X, research providers, CDP only if I explicitly provide credentials

Actions: check each dependency, explain blockers, write only safe local config after I confirm, npm install in web/, npm run sync:skills, npm run readiness, start Hermes (`hermes gateway run`) + npm run dev. Verify /api/capabilities. End with unlocked vs optional capabilities and the first click path (domain → dossier → Sales or Marketing).

Ask before writing config, applying SQL, CDP, or external APIs. No invented emails, auto-send, or publish.
```

## Research modes

| Mode | Needs | Unlocks |
|------|-------|---------|
| Manual / first-party | Domain you enter | Works with zero research APIs |
| Research provider | Linkup / Exa / Tavily key | Faster structured discovery |
| Browser | Dedicated Chrome CDP + Hermes | Public-page research you approve |

## Capability gates

- No AgentMail → drafts only (Send hidden)
- No X → copy / manual post; **Post to X** when OAuth is connected
- No Hermes/model → agent runs blocked with a clear fix
- Marketing CRM / cold DMs → Advanced / later (not default journey)

## Privacy

- Keys stay in your `.env.local` / Hermes home; connected-account OAuth tokens are encrypted at rest (`KAMI_TOKEN_ENCRYPTION_KEY`)
- Without `KAMI_ADMIN_TOKEN`, Kami only answers requests to `localhost`
- Browser cookies stay in your dedicated profile; never put them in prompts
- Supabase data lives in **your** project

See [SECURITY.md](../SECURITY.md) and [community-release-checklist.md](community-release-checklist.md).
