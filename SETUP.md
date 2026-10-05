# Kami — local setup (Community Edition)

Self-hosted. Two processes:

1. **Hermes gateway** — agent backend, OpenAI-compatible API on `127.0.0.1:8642`
2. **`web/`** — Next.js UI + API routes

You bring a **model key**, a **Supabase** project, and **Node 20+**.  
Optional keys (research, AgentMail, X, browser CDP) unlock more; the app degrades without them.

Agent-assisted setup: copy the prompt in [docs/community-edition.md](docs/community-edition.md) or [README.md](README.md).

---

## 1. Prerequisites

| Need | Why |
|------|-----|
| Node.js **20+** + npm | Build/run `web/` |
| Git | Clone |
| [Hermes Agent](https://hermes-agent.nousresearch.com/docs/) | Manager + specialists |
| Model API key | Hermes LLM (OpenAI, OpenRouter, Anthropic, etc.) |
| Supabase project | Sessions, campaigns, contacts, opportunities, `agent_run_logs` |
| PowerShell on Windows | Prefer native Windows for `npm run dev` (WSL + `/mnt/c` often breaks Turbopack) |

Optional later: Linkup/Exa/Tavily, AgentMail, X developer app, Chrome with remote debugging (CDP).

---

## 2. Clone and install the web app

```bash
git clone https://github.com/saranambiar/kami.git
cd kami/web
npm install
```

Windows (PowerShell): `cd kami\web` then `npm install`.

---

## 3. Install and configure Hermes

1. Install Hermes per [official docs](https://hermes-agent.nousresearch.com/docs/).
2. Copy the repo root [`.env.example`](.env.example) into Hermes home (this file is for Hermes, not the web app):
   - **Windows:** `%LOCALAPPDATA%\hermes\.env`
   - **macOS / Linux:** `~/.hermes/.env`
3. Set at least:
   - Your model provider key (e.g. `OPENAI_API_KEY=…`)
   - `API_SERVER_ENABLED=true`
   - `API_SERVER_HOST=127.0.0.1`
   - `API_SERVER_PORT=8642`
   - `API_SERVER_KEY=` a long random secret (same value will go in `web/.env.local` as `HERMES_API_KEY`)
4. Confirm `config.yaml` (or env) does not leave you on a provider with an empty key.
5. For nested manager → specialist delegation, Hermes `delegation.max_spawn_depth` should be **≥ 2** if you use orchestrator roles (see Hermes docs / project `AGENTS.md`).
6. **Marketing distribution research** uses a Hermes Distribution Manager that calls `delegate_task` with a parallel `tasks` array (platform specialists). Ensure:
   - `delegation.orchestrator_enabled` is not `false`
   - Research/browser tools are enabled on the gateway so **leaf** specialists inherit them
   - Skills are synced (`npm run sync:skills`) so `{platform}_distribution` playbooks exist under Hermes `skills/gtm/`
   - Top-level manager → leaf only needs default spawn depth; raise `max_spawn_depth` if the manager itself is nested
   - The OpenAI-compatible API server runs `delegate_task` **synchronously** on `/v1/chat/completions` (stateless), so research requests may take several minutes — keep the gateway process up

Start the gateway when ready (exact command depends on your Hermes install; common pattern):

```bash
hermes gateway run
```

Health check: API server listening on `http://127.0.0.1:8642` (chat completions path used by Kami: `/v1/chat/completions`).

---

## 4. Configure the web app

Use [`web/.env.example`](web/.env.example) (not the root Hermes template):

```bash
cd web
cp .env.example .env.local
```

Windows (PowerShell): `copy .env.example .env.local`

### Required in `web/.env.local`

```dotenv
HERMES_GATEWAY_URL=http://127.0.0.1:8642/v1/chat/completions
HERMES_API_KEY=<same as Hermes API_SERVER_KEY>
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<Supabase service_role key>
```

Use the **service role** key only on the server (never expose it to the browser). Free-tier Supabase is fine.

### Optional

| Variable | Unlocks |
|----------|---------|
| `LINKUP_API_KEY` / `EXA_API_KEY` / `TAVILY_API_KEY` | Faster structured research |
| `HERMES_BROWSER_CDP_URL` | Browser research (dedicated Chrome profile; see `scripts/browser-connect.md`) |
| `AGENTMAIL_API_KEY` + `AGENTMAIL_INBOX` | Real Sales email send (drafts still work without this) |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` / `X_REDIRECT_URI` | Log in with X + **Post to X** ([docs/marketing-credentials.md](docs/marketing-credentials.md)) |

---

## 5. Database migrations

In the Supabase **SQL editor** (or CLI), apply **in this order**:

| # | File | Notes |
|---|------|--------|
| 1 | `web/supabase/migrations/001_init.sql` | Core |
| 2 | `002_crm.sql` | CRM tables |
| 3 | `003_marketing.sql` | Marketing |
| 4 | `004_sales.sql` | Sales |
| 5 | `005_connected_accounts_session.sql` | Connected accounts |
| 6 | `006_placeholder.sql` | No-op (keeps numbering contiguous) |
| 7 | `007_sales_segments.sql` | ICP segments |
| 8 | `008_domain_truth.sql` | Domain / dossier |
| 9 | `009_distribution_opportunities.sql` | **Required for Marketing queue** |
| 10 | `010_agent_run_logs.sql` | **Required for observability / Ledger-style logs** |
| 11 | `011_distribution_plan.sql` | **Required for Hermes-recommended distribution plans** (flexible goal + approve status) |
| 12 | `012_opportunity_formats.sql` | **Required for viral format fields** (`format_used` / `format_why`) on opportunities |

If a step errors on “already exists”, you may be re-applying — check which migrations already ran.

---

## 6. Sync skills and readiness

From **repo root** (with Hermes home configured):

```bash
cd kami   # if you are still in web/
npm run sync:skills
npm run readiness
```

- `sync:skills` copies repo `skills/` into Hermes skills (GTM playbooks).
- `readiness` checks that required pieces look wired (does not print secrets).

---

## 7. Run

**Terminal A — Hermes**

```bash
hermes gateway run
```

**Terminal B — Next.js**

```bash
cd kami/web
npm run dev
```

Windows (PowerShell): `cd kami\web` then `npm run dev`.

If you hit Turbopack / instrumentation errors on Windows or WSL, use webpack:

```bash
npx next dev --webpack
```

Open **http://localhost:3000**.

---

## 8. Verify

`GET http://localhost:3000/api/capabilities` should show roughly:

- `"hermes": true`
- `"database": true`
- `"modelConfigured": true` (when Hermes + model key are good)

Then:

1. Enter a **domain** you own or control for testing  
2. Confirm dossier (**That’s us**)  
3. Choose **Find customers** or **Create distribution**  
4. Approve before any send/post — Kami must **never invent emails**

---

## Capability gates (expected)

| Missing | Behavior |
|---------|----------|
| Hermes / model | Agent runs blocked with a clear fix |
| AgentMail | Drafts only; Send hidden |
| X OAuth | Copy / “I posted this”; no live Post to X |
| Research provider | First-party / manual / CDP paths still work |

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `/api/capabilities` hermes false | Gateway up? `HERMES_GATEWAY_URL` + `HERMES_API_KEY` match `API_SERVER_KEY`? |
| database false | Supabase URL + service role? Migrations through `010`? |
| Marketing queue empty / SQL errors | Migration `009` applied? |
| No run logs | Migration `010` applied? |
| Turbopack / MODULE_UNPARSABLE | Native PowerShell + `next dev --webpack`; avoid WSL `/mnt/c` for the app tree |
| Skills not used | Re-run `npm run sync:skills`; confirm Hermes skills path |

---

## More

- Hermes agents (plan → delegate → review → gate): [docs/architecture.md](docs/architecture.md)
- BYOK + agent prompts: [docs/community-edition.md](docs/community-edition.md)
- Product loops: [docs/product-loops.md](docs/product-loops.md)
- X / Instagram credentials: [docs/marketing-credentials.md](docs/marketing-credentials.md)
- Contributing / branches: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security: [SECURITY.md](SECURITY.md)