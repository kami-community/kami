# Community Edition — release checklist

Prove each advertised capability with a **real action**, not a 200 response alone.

## Product narrative

- [ ] Landing says: **Your AI go-to-market agency for early-stage startups** with Kami logo as brand-first hero
- [ ] Two-liner matches [product-loops.md](product-loops.md)
- [ ] No “dry run executed” labels on real sends
- [ ] Onboarding: domain → confirm dossier ("That's us") → choose Find customers / Create distribution
- [ ] Ask Kami answers stay concise (≤~120 words default)
- [ ] Activity is reachable from the campaign header; no maintainer-only pages in nav

## Local setup (clean machine)

- [ ] Clone repo on a fresh machine/account using [SETUP.md](../SETUP.md)
- [ ] Copy `web/.env.example` → `web/.env.local` with **user-owned** keys only
- [ ] Set `DATABASE_URL` and start the app (or `npm run db:migrate`) on a **user-owned** Supabase project; anon key reads nothing (RLS)
- [ ] Hermes gateway on `127.0.0.1:8642` with user model key
- [ ] `npm run readiness` reports unlocked capabilities without printing secrets
- [ ] `npm run sync:skills` syncs repo skills into local Hermes home
- [ ] Agent setup prompt in [community-edition.md](community-edition.md) works when pasted into Cursor/Claude

## Shared loop

- [ ] Domain validates before research
- [ ] Dossier confirms with **That’s us**
- [ ] Job choice: Find customers / Create distribution
- [ ] Kami Guide available on every workspace screen (top bar → Ask Kami)

## Sales (real outcome)

- [ ] Confirm segment → Hermes plan (or clearly labeled offline fallback)
- [ ] Find companies is explicit; opt-in include; no invented emails; role inboxes not sequence-eligible
- [ ] Clear CTA to draft emails after contacts are found
- [ ] Review 1–3 drafts → real AgentMail send → Activity → Outbound shows the provider message id
- [ ] Reply / Needs you surfaces the next decision
- [ ] Kill switch pauses Sales sends (server returns 423 while paused)
- [ ] Unsubscribe reply adds the sender to Suppressions; a later send to them is refused

## Marketing (distribution)

- [ ] Goal picker: launch / early users / credibility / waitlist
- [ ] Today’s opportunities queue with link, why, draft, risks
- [ ] “What happened?” outcomes save with visible confirmation
- [ ] X connected (per campaign) → approve → **Post to X** → live URL in Activity → Outbound
- [ ] X disconnected → copy / “I posted this” still works
- [ ] CRM / cold DM path is under **Advanced** only (not default journey)
- [ ] Scaffold/fallback opportunities are labeled when Hermes was unavailable

## Research modes

- [ ] Works with first-party domain evidence without Linkup
- [ ] Optional research provider unlocks faster discovery
- [ ] Missing Hermes/model blocks runs with a clear fix

## Open-source hygiene

- [ ] LICENSE (MIT) present
- [ ] README + SETUP + CONTRIBUTING + SECURITY published and consistent
- [ ] No secrets in git history of release commit
- [ ] `.gitignore` covers `.env*`, `web/.next/`, eval result dumps
- [ ] CI green: lint, format, typecheck, tests, eval:sales, build, skills check, gitleaks
- [ ] Clone URL `github.com/kami-community/kami` in README, SETUP, CONTRIBUTING and agent prompts
- [ ] Non-localhost request without `KAMI_ADMIN_TOKEN` is refused; cross-site POST is refused
