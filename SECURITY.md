# Security model — Kami Community Edition

## Trust boundaries

| Component | Trust |
|-----------|--------|
| Local Next.js app | Owns persistence, approvals, side-effect policy |
| Local Hermes gateway | Reasoning + delegation; least-privilege tools |
| User Supabase project | Campaign/dossier/opportunity data |
| Dedicated browser profile | Optional research; user-consented cookies/sessions |
| Provider keys | User-owned; stay in `.env` / Hermes home |

## Hard rules

1. **Never invent contact emails.** Send is blocked without a real address.
2. **Founder approval** is required for real email send and X publish.
3. **Hermes must not receive** raw provider keys, Supabase service-role keys, or browser cookie dumps in prompts.
4. **Browser CDP** uses a dedicated profile; everyday profiles require explicit consent.
5. **No secrets in git.** Use `web/.env.example` and root `.env.example` only.
6. Community Edition is **single-user local**. Do not expose `SUPABASE_SERVICE_ROLE_KEY` to browsers or the public internet.

## Enforcement

| Control | Where |
|---|---|
| Access | `web/proxy.ts` + `web/lib/auth/access.ts`. Without `KAMI_ADMIN_TOKEN` only `localhost` requests are served. With it, requests need the signed admin cookie (from `/login`) or `Authorization: Bearer <token>`. Cross-site mutations are rejected. |
| Jobs | `/api/jobs/*` accept `Authorization: Bearer $KAMI_CRON_SECRET` (or a signed-in admin). |
| Webhooks | AgentMail: Svix signature (`AGENTMAIL_WEBHOOK_SECRET`). Instagram: `X-Hub-Signature-256` with the app secret. Unsigned calls are rejected. |
| Database | Row-level security on every table; only `service_role` has grants (`001_schema.sql` lockdown). The anon key reads nothing. |
| OAuth tokens | Encrypted at rest with AES-256-GCM (`KAMI_TOKEN_ENCRYPTION_KEY`). |
| Outbound | Every send/post/DM passes the kill switch, suppression list and approvals, and records an idempotent receipt (`web/lib/outbound/`). |
| Input | Every route validates its body and query with zod; list endpoints require `session_id`. |

## Reporting

Open a private security advisory or email the maintainers if you find a vulnerability. Do not file public issues that include secrets or exploit PoCs against third-party accounts.
