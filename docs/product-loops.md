# Kami product loops

Source of truth for Kami's founder-facing MVP.

## What Kami sells

**Kami — Your AI go-to-market agency for early-stage startups.**

**Tell Kami what you built. It helps you find customers and get your product in front of the right people.**

Kami is a guided GTM operator, not a generic content generator, CRM, email-blast tool, or opaque autonomous agent. It learns the company from its domain, recommends a small next step, researches and prepares real actions, and keeps the founder in control of publishing and sending.

## Philosophy

**Domain-first → recommend → confirm → act → learn → escalate.**

The product must feel simple even when the underlying work is complex. A founder should never need to understand ICPs, sequencing, distribution strategy, or platform mechanics before Kami can help them.

- Begin from a company domain and show an evidence-backed plain-language dossier before asking for GTM decisions.
- Make Kami's recommendation the default. The founder confirms, edits, skips, or asks for another option; they do not assemble a campaign from a blank form.
- Give each screen one job and one primary CTA. Reveal advanced controls only after the founder needs them.
- Work in small, approval-based batches: a few companies, a few messages, or a few distribution opportunities—not an overwhelming dashboard or calendar.
- Explain every recommendation in simple language: what Kami found, why it matters now, what action it suggests, and any risk or community rule.
- Keep explicit human approval for real sends and high-trust/community actions. Kami may later publish through supported connectors only with an explicit, per-action approval policy.

## Shared core product loop

```text
1. START       Enter domain
2. UNDERSTAND  Kami builds a company dossier; founder confirms it
3. CHOOSE      Founder chooses the job: Find customers or Create distribution
4. RECOMMEND   Kami proposes the single highest-leverage next move
5. APPROVE     Founder approves a small, plain-English plan
6. PREPARE     Kami researches, explains, and drafts the real actions
7. ACT         Founder approves/sends/posts; Kami executes supported actions
8. LEARN       Kami captures outcomes and recommends the next best action
```

The home experience answers one question: **“What should I do next to grow?”**

## Sales loop — create customer conversations

**Founder job:** “Help me reach people who could become customers.”

Kami recommends one first customer segment in plain English, helps the founder confirm a small set of target companies, verifies fit and real public contact details, drafts thoughtful outreach, and lets the founder approve the first 1–3 sends. Replies and meetings flow to **Needs your decision**.

**Required outcome:** credible potential customers receive thoughtful, relevant outreach and the founder gets real conversations to act on—not merely a list of leads or generated email copy.

## Current Sales flow detail

```text
1. START      Domain + goals + stage
2. UNDERSTAND Overview dossier (edit + save, or Regenerate with NL correction)
3. CHOOSE     Find customers → Sales  OR  Create distribution → Marketing
4. CONFIRM    NL: who / what / how many (prefilled)
5. PLAN       Plain-English next steps → Approve
6. FIND       B2B: companies + why → Include/exclude → Continue
              PLG/D2C: honest “Find people to reach” → Create distribution (no invented consumer emails)
7. CONTACT    Ensure email on included companies (add / test inbox)
8. DRAFT      Emails appear
9. SEND       Hybrid review/send (1–3, then batch)
10. WATCH     Needs you (replies, meetings)
```

## Marketing loop — create attention and trust

**Founder job:** “Help the right people discover and care about what I’m building.”

1. Founder chooses **Create distribution** (no goal chip quiz).
2. Hermes Distribution Manager recommends one goal, angle, and 2–3 surfaces from the dossier; founder confirms or edits (“Try another”).
3. On **Find opportunities**, the Manager `delegate_task`s platform specialists (`*_distribution` + `viral_formats` skills) in parallel and synthesizes a short queue **only for the approved surfaces**.
4. Kami presents **Today’s distribution opportunities**.
5. Every item shows the link, why it matters, suggested action, the **current format** used for the draft (`format_used`), and community rules or risks. Formats are re-researched each run so drafts stay timely — not a static tip list.
6. The founder posts manually, or approves a supported publishing action (X when connected).
7. Kami records replies, interest, traffic, or signups and recommends whether to repeat, revise, or stop.

**Required outcome:** the product appears in the right conversations with a useful, credible message—not merely a queue of AI-generated posts.

### Platform-agent MVP roles

| Agent | MVP output | Execution policy |
|------|------------|------------------|
| X | Relevant conversations, reply drafts, quote-post ideas, standalone posts | Manual first; supported publishing can follow explicit approval |
| Reddit | Relevant subreddits, thread-specific value-first replies, community rules | Manual only |
| LinkedIn | Founder-post drafts and thoughtful comment targets | Manual copy/paste or composer deep link |
| Hacker News | Relevant discussions, conservative comment drafts, Ask/Show HN launch material | Manual only |
| Product Hunt | Launch assets: tagline, description, maker comment, FAQ, launch-day checklist | Founder-led launch; manual only |
| Discord | Opportunities and helpful answer drafts only in explicitly connected or supplied communities | Opt-in communities; never unsolicited DMs |

## Feature loops

| Loop | Trigger | User | Kami | Success feel |
|------|---------|------|------|----------------|
| Understand | Domain submit | Wait / skim / edit / regenerate | Linkup + Hermes dossier | “That’s us” |
| Enter Sales | Find customers | Click CTA | Prefill from dossier | “Not a blank form” |
| Confirm | NL screen | Edit sentences / Continue | Map NL → SalesCampaignConfig | “I steered who/what” |
| Plan | After confirm | Approve | Synthesize plan (plain English) | “I know what happens next” |
| Find (B2B) | Find companies | Include/exclude | Discover + scores + sources | “I know why these” |
| Find (PLG/D2C) | Individual segments | Create distribution | Route to Marketing opportunity queue | “Not a company blast” |
| Contact | Before draft/send | Add email if missing | Persist sales_contacts | “We can actually email someone” |
| Draft | After include + email | Open Review emails | Sequences + touchpoints | “Drafts ready” |
| Trust send | Drafts ready | Review 1–3, then batch | Reviewer + AgentMail + receipt | Real send |
| Convert | Reply / meeting | Decide | Classify, escalate, calendar | Meeting path |
| Choose Marketing | Create distribution | Confirm / edit Hermes plan | Distribution Manager recommends goal + angle + surfaces | “I know what story to tell” |
| Opportunities | Agent research completes | Review a short action queue | Link evidence, explain why, draft platform-specific action | “These are worth doing today” |
| Participate | Opportunity approved | Post manually or approve a supported action | Record action and supported receipt | “We showed up credibly” |
| Learn | Outcome recorded | See the next recommended move | Recommend repeat, revise, or stop | “Kami learns what works” |
| Safety | Anytime | Kill switch / Advanced | Pause, DNC, caps | No surprises |

## UX rules (non-negotiable)

- One primary Hanko-red CTA per screen. The label names the immediate founder outcome, not internal GTM terminology.
- One job per screen. Prefer **Confirm what Kami understood**, **Choose who to help first**, **Check these companies**, **Approve first send**, and **Review today’s opportunities** over dense setup forms.
- Progressive disclosure: show the next decision first. Keep pipeline, meetings, tasks, analytics, policy settings, raw scores, and technical detail under **More** or **Advanced** until relevant.
- Never make the founder choose among many strategies before Kami has made a recommendation.
- Default to small batches: one recommended segment, 3–5 companies or opportunities, and 1–3 first sends.
- Never invent contact emails.
- Discovery only on explicit **Find companies** click after plan approve (B2B seed companies).
- PLG/D2C individual segments must not dead-end on company Find — route to **Create distribution**.
- Marketing and Sales are separate jobs powered by the same dossier: Sales creates direct conversations; Marketing creates attention and trust that makes those conversations easier.

## References

- [DESIGN.md](../DESIGN.md)
- [AGENTS.md](../AGENTS.md) — Product UX principles
- [SETUP.md](../SETUP.md) — local Community Edition setup
- Eval harness: `web/evals/e2e/` (run `npm run eval:e2e`)
