<p align="center">
  <img src="assets/kami-logo-2.png" alt="Kami" width="160" />
</p>

<h1 align="center">Kami</h1>

<p align="center">
  <strong>Your AI go-to-market agency for early-stage startups.</strong><br />
  Community Edition — self-hosted, bring your own keys.
</p>

Tell Kami what you built. It learns your company from your domain, then helps you **find customers** and **create distribution** — with real research, reviewed drafts, and nothing sent without your approval.

## How it works

1. **Enter your domain.** Kami reads your site and public evidence and writes a company dossier.
2. **Confirm it — "That's us".** Edit it or correct it in plain language first.
3. **Choose a job.**
   - **Find customers (Sales):** segments → plan → verified companies and real public contacts → reviewed email drafts → you approve each send → replies land in *Needs your decision*.
   - **Create distribution (Marketing):** a plan from your dossier → live conversations on X, Reddit, LinkedIn, HN, Product Hunt and Discord with a useful draft for each → post to X from Kami or copy and post yourself.
4. **Ask Kami anytime.** Kami Guide answers from your live campaign state.
5. **See everything on Activity:** every send with its provider receipt, every agent run with its input and output, your suppression list.

Under the hood, [Hermes](https://hermes-agent.nousresearch.com/docs/) runs the agents (role prompts in [`agents/`](agents/), playbooks in [`skills/`](skills/)); the Next.js app in [`web/`](web/) owns the workflow, the approvals and every integration. See [docs/architecture.md](docs/architecture.md).

## Principles

- **Never invents contacts.** Sends are blocked until a real address exists.
- **You approve every real action.** A kill switch is always one click away.
- **Proof, not status codes.** Every send stores the provider's message id or live URL.
- **Your keys, your data.** Kami runs on your machine against your Supabase project.

## Requirements

| | |
|---|---|
| Node.js **22+** | for `web/` |
| [Hermes Agent](https://hermes-agent.nousresearch.com/docs/) | with its API server enabled |
| A model API key | used by Hermes (OpenAI, OpenRouter, Anthropic, …) |
| A Supabase project | free tier is fine; or run it locally with the Supabase CLI |
| Optional | Linkup / Exa / Tavily · AgentMail · X developer app · Instagram app · Google Calendar · Langfuse |

## Quick start

```bash
git clone https://github.com/kami-community/kami.git
cd kami/web
npm install
cp .env.example .env.local          # fill in the Required block
cd ..
npm run sync:skills                 # copy playbooks into Hermes
npm run readiness                   # checks config without printing secrets
```

Apply the database migrations (in order, `001`–`018`): either run each file in `web/supabase/migrations/` in the Supabase SQL editor, or with the Supabase CLI from `web/`: `supabase link` then `supabase db push`.

Then run Hermes' gateway and the app in two terminals:

```bash
hermes gateway run                  # terminal A
cd web && npm run dev               # terminal B → http://localhost:3000
```

Full walkthrough, optional integrations and troubleshooting: **[SETUP.md](SETUP.md)**.

## Docs

| | |
|---|---|
| [SETUP.md](SETUP.md) | Local setup, integrations, troubleshooting |
| [docs/architecture.md](docs/architecture.md) | How the workflow, agents and gates fit together |
| [docs/product-loops.md](docs/product-loops.md) | The product contract |
| [docs/community-edition.md](docs/community-edition.md) | What self-hosting means; agent-assisted setup prompts |
| [docs/marketing-credentials.md](docs/marketing-credentials.md) | X and Instagram apps, step by step |
| [AGENTS.md](AGENTS.md) | Rules for contributors and coding agents |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branches, PRs, what to work on |
| [SECURITY.md](SECURITY.md) | Security model and reporting |
| [CHANGELOG.md](CHANGELOG.md) | What changed |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | How we work together |

## License

MIT — see [LICENSE](LICENSE). Third-party components (including the Remotion-based `video/`) keep their own licences: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
