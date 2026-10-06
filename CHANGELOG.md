# Changelog

All notable changes are recorded here, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Security
- Single-user access boundary (`web/proxy.ts`): localhost-only without `KAMI_ADMIN_TOKEN`; signed admin cookie or bearer token otherwise; cross-site mutations rejected; cron secret limited to `/api/jobs/*`.
- Row-level security on every table, grants to `service_role` only (migrations `016`, `018`).
- OAuth tokens encrypted at rest (`KAMI_TOKEN_ENCRYPTION_KEY`); webhooks verify signatures (Svix, `X-Hub-Signature-256`).
- Every route validates input with zod; list endpoints require `session_id`. The open `/api/chat` proxy is gone.

### Added
- One outbound pipeline for email, X posts and DMs: kill switch → suppressions → approvals → idempotent receipt → provider id (`outbound_receipts`, migration `013`).
- Ports and adapters for email (AgentMail), search (Linkup/Exa/Tavily), ads (X Ads), calendar (Google) and email verification (DNS).
- Agent registry: each step runs one named Hermes agent (`agents/*.md`) with zod-validated output and one corrective retry.
- Outreach agent drafts sequences; editable draft review queue; reply triage with an unsubscribe floor.
- X Ads boosts, Google Calendar meeting invites, AgentMail and Instagram webhooks, optional in-process scheduler (`KAMI_SCHEDULER`).
- Activity page: outbound receipts, agent runs, Hermes sessions, suppressions.
- Lint, format, typecheck, unit tests and gitleaks in CI; `npm run check:skills`.

### Changed
- Dossier generation runs on the server; any edit resets confirmation, and GTM steps require a confirmed dossier.
- Campaign state lives in a `CampaignProvider`; UI fetches through a typed `api`/`useApi` layer with visible errors.
- Design system: tokens, motion and primitives (`Seal`, `Skeleton`, `Callout`, `FoldSteps`, `RichText`, `Tabs`, `ConfirmDialog`).
- Skills: merged review rubrics, one freshness rule in `business_rules`, `founder_voice` replaces `persona_mimic` (no impersonation).
- Docs rewritten for macOS/Linux/Windows; migrations are contiguous `001`–`018`.

### Removed
- Superseded routes and components (`/api/chat`, `/api/crm`, `/api/email/*`, `/api/x/post`, Board/Ledger/CRM pages, `CmoChat`, `ConnectX`), `state/` and `contracts/`.

## 0.1.0 — Community MVP (2026-07-23)

- Canonical product narrative: AI go-to-market agency for early-stage startups
- Domain → dossier confirm → Find customers / Create distribution
- Sales plan Hermes/offline source labeling
- Marketing distribution opportunity queue (CRM preserved under Advanced)
- Capability registry + readiness / skill sync scripts
- Persistent Ask Kami guide
- Self-hosted BYOK docs, MIT license, CI scaffold
