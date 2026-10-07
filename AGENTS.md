# AGENTS.md — working on Kami

Guidance for coding agents and human contributors. Read this before changing code, agents or skills. Setup lives in [SETUP.md](SETUP.md); product behaviour in [docs/product-loops.md](docs/product-loops.md); architecture in [docs/architecture.md](docs/architecture.md).

## What Kami is

Kami is a self-hosted, bring-your-own-key AI go-to-market agency for early-stage founders. A founder enters their domain, confirms what Kami learned about the company, then chooses **Find customers** (Sales) or **Create distribution** (Marketing). Kami researches and drafts; the founder approves every real send, post or DM.

- **Hermes** ([Nous Research](https://hermes-agent.nousresearch.com/docs/)) is the agent runtime. Kami never calls a model provider directly.
- **`web/`** is the Next.js app: UI, API routes, the workflow that sequences agent steps, and every integration.
- **`agents/`** holds one role prompt per agent; **`skills/`** holds the playbooks agents apply (synced into Hermes).
- **Supabase (Postgres)** is the only state store.

## Architecture in one screen

The product is a gated workflow: *recommend → confirm → act → learn*. The app owns the workflow; each step runs **one named Hermes agent** whose output is validated before it is used. Only Kami Guide runs as an open-ended orchestrator, and it can only *propose* actions.

```
web/
  app/start/            onboarding: domain → confirm dossier → choose a job
  app/c/[id]/           the campaign workspace; one URL per view (lib/client/routes.ts)
  app/api/**/route.ts   thin HTTP layer: parse (zod) → call a service → respond
  lib/
    config/env.ts       the only reader of process.env (zod-validated)
    http/               route(), parseBody/parseQuery, AppError → { error, code }
    auth/access.ts      single-user access rules used by proxy.ts
    db/client.ts        db(): service-role Supabase client (RLS denies everyone else)
    domain/             zod schemas + types shared by server and browser
    ports/              provider interfaces (email, search)
    adapters/           one module per vendor (AgentMail, X, Instagram, Linkup/Exa/Tavily)
    providers.ts        picks adapters from config — services never import vendors
    hermes/             the one Hermes client, agent registry, JSON parsing, SSE
    guide/              Kami Guide: context pack + typed event stream (domain/guideEvents.ts)
    drafting/           passage rewrites for stored drafts
    campaigns/          sessions, research, dossier, context pack
    outbound/           send policy, suppressions, receipts, every send/post/DM flow
    inbound/            replies (webhooks + polling)
    sales/ marketing/   feature services
    connections/        OAuth connections with sealed tokens
    jobs/               optional in-process scheduler
    client/             browser-only helpers (api client, useApi, streaming)
  components/           React UI; campaign state via components/campaign/CampaignProvider
    shell/              workspace frame: sidebar, top bar, agent activity, view router
    areas/              one screen per workspace area (Home, Inbox, Find customers, …)
    ui/ bui/            design-system atoms, Beautiful UI primitives
  supabase/migrations/  schema, applied on startup by lib/db/migrate.ts
```

## Rules

### Layering
- Routes are thin: `export const POST = route(async (request) => { const input = await parseBody(request, Schema); return Response.json(await service(db(), input)); })`.
- Business logic lives in `lib/<area>/` services that take `db` as their first argument and throw `AppError`s (`badRequest`, `notFound`, `forbidden`, `paused`, `conflict`, `notConfigured`, `upstreamFailed`). Never return `null` to signal failure, and never swallow errors silently.
- Every list endpoint requires `session_id` (a uuid) and every query is scoped to it.
- Read configuration through `env()`, never `process.env`.
- Browser code imports server modules for **types only** (enforced by ESLint). The browser talks to the server through `lib/client/api.ts`.

### Agents
- Call Hermes only through `lib/hermes/client.ts`: `runAgentJson({ agent, kind, input, schema, kamiSessionId })` for structured output, `completeOrNull` where a step has a deterministic fallback, `streamResponse` for streaming.
- Each agent has a role prompt in `agents/<name>.md` registered in `lib/hermes/agents.ts`. Change *how an agent behaves* there or in `skills/`, not in route code. The per-call input (evidence, context pack) is built in the service.
- Validate agent output with a zod schema from `lib/domain/`. Put checks the agent can fix (identity lock, grounding) in the schema (`superRefine`) so the agent gets one corrective retry.

### Real-world actions (non-negotiable)
- Every send, post and DM goes through `lib/outbound/`: kill switch and area pause → suppression list → approvals and review → claim an idempotent receipt → provider call → record the provider id. A send without a provider id is not a send.
- Never invent contact details. Recipients come from stored contacts, never free text from an agent.
- Kami never sends on its own initiative: the founder's click is the approval, and Kami Guide only proposes.
- Webhooks verify signatures (Svix for AgentMail, `X-Hub-Signature-256` for Instagram). Jobs accept the cron secret.

### Data
- New tables go in a new numbered migration and must `enable row level security`.
- Prefer one table per concept: one suppression list (`suppressions`), one outbound ledger (`outbound_receipts`).

### UI
- The product experience (onboarding, navigation, where things live, how agent work is shown) is [docs/product-experience.md](docs/product-experience.md). New screens go in an existing area; add a sidebar item only for a new top-level job.
- Every screen has a URL (`/c/<id>/<area>/<tab>`); navigate with `useWorkspace().navigate`, never browser-only state.
- The design system is [DESIGN.md](DESIGN.md): Beautiful UI tokens in `app/styles/foundation.css`, atoms in `components/ui/`, primitives in `components/bui/`. No UI dependencies — port, don't install.
- One `accent` `Button` per screen; everything else is `secondary`, `ghost` or `quiet`.
- Compose screens from the shared primitives (`Button`, `Field`, `Card`, `Segmented`, `Callout`, `ConfirmDialog`, `ConnectSocials`, and the `bui/` components). Avoid new inline styles.
- Agent waits show `LoadingState` / `ThinkingState`; workflow state (step gates, counts) comes from `GET /api/sessions/:id/progress`, never browser memory.
- Every fetch shows loading and error states (`useApi`, `ApiError`). Never `catch(() => {})`.
- Accessible by default: labelled inputs, `role="alert"` for errors, `aria-live` for streaming text, keyboard-operable tabs and dialogs.

## Product principles

Canonical loops live in [docs/product-loops.md](docs/product-loops.md).

- **Domain-first:** the founder confirms the dossier ("That's us") before any GTM choice; never start from a blank ICP form. The server enforces this.
- **Two jobs:** Find customers (Sales) or Create distribution (Marketing).
- **Recommend → confirm → act → learn → escalate**, in small batches, with the kill switch always visible.
- **Never invent emails:** sends are blocked until a real contact email exists.
- **Marketing CRM / cold DMs** are Advanced; the default Marketing view is the distribution opportunity queue.
- **Kami Guide** is available on every screen (top bar → Ask Kami) and gets a fresh context pack every turn.
- **Agent work is visible:** a Hermes run is shown while it runs (top-bar activity, Team area), not only after.

## Verify before calling something done

```bash
cd web
npm run lint && npm run typecheck && npm test && npm run eval:sales && npm run build
```

For real-surface changes, also check the outbound ledger on the Activity page: a provider id or URL is the proof, not an HTTP 200.
