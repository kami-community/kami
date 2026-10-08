# Kami product experience

How Kami should feel to a founder: what they see first, where everything lives, and how the agents' work is made visible. The product loop itself is defined in [product-loops.md](product-loops.md). This document defines the **experience** that wraps it. UI rules live in [DESIGN.md](../DESIGN.md).

## 1. What was wrong

An audit of the redesigned UI (October 2026):

| Problem | Where | Effect |
|---|---|---|
| Two navigation systems on top of each other | Sidebar: 4 primary items, then 18 step links in "Find customers", "Distribution" and "Activity" groups | The founder sees 20+ destinations on day one and can't tell which one matters |
| Overview shows everything | Overview: recommendation, flowchart, insights, the full dossier and evidence | No single job; "Where should Kami start?" is still asked after work has started |
| Onboarding mixed with a marketing page | Landing: hero, resume card, domain box, goals quiz, six feature cards | The first screen of a self-hosted app tries to sell the app |
| Links to a page don't open the campaign | `/?view=sales.emails` shows the landing page, and `replaceState` breaks Back/Forward | Not the URL behaviour people expect from a SaaS app |
| Hermes is only visible after the fact | `agent_run_logs` gets a row only when a run finishes, and progress is timed fake stages | The founder can't see what Kami is doing now; a long wait looks like a hang |
| Work that needs the founder is split up | Needs you, Inbox, Meetings and Tasks are separate Sales steps, and opportunities to review sit under Distribution | No single "what needs me" place |
| Settings mixed into workflow | Sales "Setup", the dossier, connections and suppressions sit inside workflow screens | The founder can't find where to change things |
| The Guide takes space by default | A 360px Kami Guide panel is docked on every screen | Less room for the actual work |

## 2. Principles (SaaS conventions)

1. **Familiar shell.** A left sidebar with only a few top-level sections, a top bar with breadcrumbs, search (⌘K), the agent activity indicator and "Ask Kami", and the content on the right. Detail lives in page tabs, not in the sidebar.
2. **Real URLs.** `/c/<campaign>/<section>/<tab>`. Back and Forward work, every page can be linked to, and a reload lands in the same place.
3. **One inbox.** Everything waiting on the founder (drafts to approve, replies, meetings, opportunities, tasks) appears in one place with a count, like Linear's Inbox or Front.
4. **Onboarding is a focused, full-screen flow** with a step indicator: *Company → Confirm → Choose a job*. No sidebar until the founder is in.
5. **The agents are the team.** Kami is an agency, so Hermes agents are shown as named team members, each with a role, skills, current work and history. A run is visible while it happens, not only after.
6. **Settings are settings.** Company profile, connections, sending guardrails and do-not-contact live under Settings, not inside workflow screens.

## 3. Information architecture

```
Onboarding (no shell)          /                      → saved campaign? go to /c/<id>
                               /start                 domain → research → confirm → choose
Workspace /c/<id>/
  Home                         /c/<id>                next step, waiting on you, team activity, results
  Inbox                 (n)    /c/<id>/inbox          drafts · replies · meetings · opportunities · tasks
  Find customers               /c/<id>/sales/<tab>    Plan · Companies · Emails · Pipeline
  Distribution                 /c/<id>/distribution/<tab>  Opportunities · Plan · Boosts · Creators (Advanced)
  Team                  (●)    /c/<id>/team/<tab>     Agents · Runs · Hermes
  ─────
  Activity                     /c/<id>/activity/<tab> Sent log · Do-not-contact
  Settings                     /c/<id>/settings/<tab> Company · Sending · Connections
```

Sidebar: a campaign switcher at the top, the five items above, then Activity and Settings at the bottom with the kill switch. That is 7 items, down from 22.

### Find customers

The setup sequence (*Who → Plan → Companies → Emails*) is a horizontal **stepper** at the top of the Find customers area. Steps that aren't unlocked yet show why. After the first send the stepper shrinks to a compact progress line and the tabs (Plan · Companies · Emails · Pipeline) become the main navigation. "Confirm ICP" is part of the **Plan** tab (who comes before the plan). Sales "Setup" (who/what, pace, autonomy) moves to **Settings → Sending**. Replies, meetings and tasks move to **Inbox**.

### Distribution

The default tab is Opportunities. If the plan isn't approved yet, every tab shows the plan-approval flow first. Boosts and Creators sit behind an "Advanced" divider in the tab bar.

## 4. Onboarding

| Step | Screen | Primary action | What Kami does |
|---|---|---|---|
| 1 Company | A narrow left-aligned column: "What's your company's domain?", optional goal chips that wrap, and a button that fits its label | **Research my company** | Checks the domain, reads the site and searches for mentions; a live trace shows each step |
| 2 Confirm | The dossier summary as a readable card, with edit and correct-with-text options | **That's us** | The brand analyst drafts and grounds the dossier; any correction is shown as a diff before it's saved |
| 3 Choose | Two large cards: Find customers / Create distribution, with Kami's recommendation marked | **Start with …** | Opens the workspace in the chosen area |

A founder who leaves part-way returns to the same step (the server already knows: dossier exists → confirmed → job chosen).

## 5. Showing Hermes in the product

| Surface | What the founder sees | Source |
|---|---|---|
| **Top-bar activity indicator** | A pulsing dot and "2 agents working" while runs are in flight; clicking it opens a popover with each live run (agent, task, elapsed time) and the latest finished runs | `agent_run_logs` rows with `status = 'running'`, written when a run *starts* and updated when it ends |
| **Inline step waits** | Each long step names the agent doing it ("Sales researcher is verifying 5 companies"), with an elapsed timer and the staged trace | Existing LoadingState / ThinkingState, labelled from the agent registry |
| **Team → Agents** | One card per agent: name, role in one line, skills, runs, success rate, last run, and "working now" when live | `GET /api/activity/agents`: the agent registry plus run statistics |
| **Team → Runs** | The full run log with input/output, including running and failed runs | Existing Agent runs |
| **Team → Hermes** | Hermes' own session ledger and kanban | Existing Hermes state |
| **Home → Team activity** | The last 5 runs in plain language ("Outreach drafted 3 emails · 2m ago") | Same as Runs |

A run row is inserted with `status='running'` at start and updated to `ok`/`error`/`timeout` at the end. A run left `running` for longer than its timeout plus a margin is shown as `stale` (crash safety), so the indicator never spins forever.

## 6. Home

The page answers *"What should I do next to grow?"*, in this order:

1. **Next step.** One recommendation card with the single accent button, worked out from progress (confirm ICP → approve plan → find companies → review N drafts → answer N replies → review opportunities …).
2. **Waiting on you.** Up to 5 inbox rows plus "View all in Inbox".
3. **Get started checklist.** Shown only until the first send or post: dossier ✓ · choose job · plan · first companies · first send.
4. **Results.** Emails sent, replies, meetings, posts published (counted on the server).
5. **Team activity.** The last runs and who is working now.

The dossier and evidence move to Settings → Company. The flowchart and insight carousel are removed from Home.

## 7. Kami Guide

Closed by default. The top-bar **Ask Kami** button (or `/`) opens it as a right-hand panel, and the open/closed choice is remembered per browser. It still receives a fresh context pack every turn and still only *proposes*.

## 8. Delivery

| Workstream | Scope |
|---|---|
| A. Shell and routing | `/c/[id]/[[...path]]`, the new sidebar, top bar, campaign switcher (`GET /api/sessions`), Guide closed by default, `/` redirect |
| B. Onboarding | `/start` three-step flow; replaces Landing + DossierConfirm-on-Overview |
| C. Hermes visibility | `running` run rows, `GET /api/activity/agents`, top-bar indicator, Team area |
| D. Home + Inbox | New Home; Inbox combining drafts, replies, meetings, opportunities and tasks |
| E. Areas | Find customers stepper + tabs; Distribution tabs; Activity; Settings (Company, Sending, Connections) |

Done means: lint, typecheck, tests, eval:sales and build all pass; every route has been clicked through in the browser against the mock Hermes; nothing has been sent.
