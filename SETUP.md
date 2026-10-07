# Setup — Kami Community Edition

Kami runs as two processes on your machine:

1. **Hermes** — the agent runtime, with its OpenAI-compatible API server on `127.0.0.1:8642`.
2. **`web/`** — the Next.js app: UI, API routes, workflow and integrations.

You bring a model key, a Supabase project and Node 22+. Everything else is optional and unlocks more; the app tells you what is missing (`npm run readiness`, the banner in the app, `GET /api/capabilities`).

Prefer an agent to do it? Paste a prompt from [docs/community-edition.md](docs/community-edition.md).

---

## 1. Prerequisites

| Need | Why |
|---|---|
| Node.js **22+** and npm | `web/` uses `node:sqlite` to read Hermes' local state |
| Git | Clone |
| [Hermes Agent](https://hermes-agent.nousresearch.com/docs/) | Runs every agent |
| A model API key | Used by Hermes |
| A Supabase project | Your data. The free tier is fine, or run locally with the [Supabase CLI](https://supabase.com/docs/guides/local-development) |

On Windows, run the app from native PowerShell rather than WSL on `/mnt/c` (file watching is unreliable there).

## 2. Clone and install

```bash
git clone https://github.com/kami-community/kami.git
cd kami/web
npm install
```

## 3. Hermes

1. Install Hermes ([docs](https://hermes-agent.nousresearch.com/docs/)).
2. Copy the repo-root [`.env.example`](.env.example) to Hermes home — `~/.hermes/.env` on macOS/Linux, `%LOCALAPPDATA%\hermes\.env` on Windows — and set:
   - your model provider key (e.g. `OPENAI_API_KEY`)
   - `API_SERVER_ENABLED=true`, `API_SERVER_HOST=127.0.0.1`, `API_SERVER_PORT=8642`
   - `API_SERVER_KEY` — a long random secret (`openssl rand -hex 32`). The same value becomes `HERMES_API_KEY` in the web app.
3. Delegation (used by Kami Guide and the Distribution manager): keep `delegation.orchestrator_enabled` on, and enable research/browser tools on the gateway so delegated specialists inherit them.
4. Sync Kami's playbooks into Hermes from the repo root:
   ```bash
   npm run sync:skills
   ```
   Re-run it after editing anything in `skills/`.

## 4. Database

Kami creates the tables itself. Set `DATABASE_URL` to the Postgres connection string (Supabase → Project Settings → Database). On `npm run dev` or `npm run db:migrate`, pending files in `web/supabase/migrations/` are applied once and recorded in `kami_schema_migrations`.

A local Supabase API (`http://127.0.0.1:54321`) uses `postgresql://postgres:postgres@127.0.0.1:54322/postgres` when `DATABASE_URL` is unset. `supabase start` from `web/` also applies that same file.

The public anon key can read nothing: row-level security is on, and only the service role Kami's server uses is granted access.

A database created by the old `001`–`018` files is left as-is when it already matches this schema. Do not `supabase db push` that history away. A half-applied older database is refused — use a new Supabase project.

## 5. Configure the web app

```bash
cd web
cp .env.example .env.local        # Windows: copy .env.example .env.local
```

Fill in the **Required** block:

```dotenv
HERMES_GATEWAY_URL=http://127.0.0.1:8642/v1/chat/completions
HERMES_API_KEY=<same as Hermes API_SERVER_KEY>
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key — server only>
```

Then `npm run readiness` from the repo root.

## 6. Run

```bash
hermes gateway run                # terminal A
cd web && npm run dev             # terminal B
```

Open **http://localhost:3000** → enter your domain → confirm the dossier → **Find customers** or **Create distribution**.

---

## Optional capabilities

Each block in `web/.env.example` is self-contained.

| Capability | Set | Notes |
|---|---|---|
| Faster research | `LINKUP_API_KEY` / `EXA_API_KEY` / `TAVILY_API_KEY` | Without one, research uses your own site |
| Browser research | `HERMES_BROWSER_CDP_URL` | Dedicated Chrome profile: [scripts/browser-connect.md](scripts/browser-connect.md) |
| Send email + receive replies | `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX` | Optional `AGENTMAIL_WEBHOOK_SECRET` for instant replies (webhook URL: `<APP_URL>/api/webhooks/agentmail`); otherwise the reply job polls |
| Connect X / Instagram | `KAMI_TOKEN_ENCRYPTION_KEY` + app keys | Tokens are encrypted at rest. Step by step: [docs/marketing-credentials.md](docs/marketing-credentials.md) |
| Instagram creator discovery | `APIFY_API_TOKEN` | Finds creators; never sends |
| Meetings | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Invites go to contacts you already have |
| Tracing | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | Every agent run is also in Activity → Agent runs |

### Background jobs

Reply polling (email, X DMs) runs from `/api/jobs/email-replies` and `/api/jobs/marketing-replies`. Either set `KAMI_SCHEDULER=on` to run them inside the app, or call them from cron / Hermes cron with `Authorization: Bearer $KAMI_CRON_SECRET`.

### Exposing Kami beyond localhost

Without `KAMI_ADMIN_TOKEN`, Kami refuses any request whose host isn't `localhost`. To reach it from another device, set `KAMI_ADMIN_TOKEN` and `APP_URL`, put it behind HTTPS, and sign in at `/login`. Community Edition is single-user.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Banner: "Hermes is not reachable" | Gateway running? `HERMES_API_KEY` equals Hermes `API_SERVER_KEY`? |
| "Supabase is not configured" | URL + service-role key in `web/.env.local`; restart `npm run dev` |
| `relation … does not exist` | Set `DATABASE_URL` and restart `npm run dev` (or run `npm run db:migrate`) |
| "Kami only serves localhost" | You opened it by IP or hostname; use `localhost` or set `KAMI_ADMIN_TOKEN` |
| Connect X/Instagram fails immediately | Set `KAMI_TOKEN_ENCRYPTION_KEY`; check the redirect URI matches the app's settings exactly |
| Dossier keeps failing | Activity → Agent runs shows the brand analyst's input, output and the validation problem |
| Agents ignore playbooks | Run `npm run sync:skills` and restart Hermes sessions |
