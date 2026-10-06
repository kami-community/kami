# Kami design system

Kami's UI is built on **[Beautiful UI](https://www.beautifului.dev)** — crafted primitives for AI-native interfaces — ported to plain CSS and React with no UI dependencies (MIT; see [`web/components/bui/LICENSE`](web/components/bui/LICENSE)). The look: a cool near-white canvas over a fine diagonal stripe, white cards with hairline rings and layered single-digit-opacity shadows, a neutral ink ramp, and semantic color used sparingly as a condiment. Light and dark themes swap every token at once.

## Where things live

| Layer | Files | What |
|---|---|---|
| Tokens & base | `web/app/styles/foundation.css` | Colors, shadows, radii, easing, keyframes, base element rules |
| Atoms | `web/app/styles/ui.css`, `web/components/ui/` | `Button`, `Field`/`Input`/`Textarea`/`Select`, `Segmented`, `Card`, pills (`StatusPill`, `ValuePill`, `EntityChip`, `Monogram`), `Callout`, `EmptyState`, `Toggle`, `ChipToggle`, `Disclosure`, `Skeleton`, `Toast`, `ThemeToggle`, `Page`/`PageHeader`/`Section`, icons |
| Primitives | `web/app/styles/bui/`, `web/components/bui/` | The Beautiful UI components (below) |
| Shell | `web/app/styles/shell.css`, `web/components/shell/` | The window frame, SidebarNav, top bar, page sections |
| Features | `web/app/styles/features.css` | Kami screens composed from the above |

Use the token, never a raw value: `var(--ink-2)`, `var(--shadow-card)`, `var(--radius-card)`.

## Tokens

- **Surfaces:** `--page` (frame) · `--canvas` (stages) · `--surface` (cards) · `--inset` (wells) · `--field` (inputs) · `--hover` / `--hover-2`.
- **Ink:** `--ink` → `--ink-2` → `--ink-3`.
- **Lines:** `--line`, `--line-strong`, `--grid-line` — solid and crisp, not alpha.
- **Accent:** `--accent`, `--accent-ink`, `--accent-tint` — the one primary action, focus rings, selection.
- **Semantic:** `--green`, `--orange`, `--red` and their `-tint`s — states only, never decoration.
- **Brand:** `--seal` — the Kami mark (`.kami-seal`) only.
- **Shadows:** `--shadow-hairline`, `--shadow-btn`, `--shadow-card`, `--shadow-raised`, `--shadow-overlay`.
- **Radii:** chips 6 · controls 8 · cards 10 · windows 14 · pills 999.
- **Type:** Inter (`--font-sans`), JetBrains Mono (`--font-mono`) for ids, code and figures; 14px base, −0.01em tracking.
- **Motion:** `--ease-out-strong` for entrances and height changes; nothing bounces; everything respects `prefers-reduced-motion`.

## Primitives and where Kami uses them

| Primitive | Used for |
|---|---|
| LoadingState | Long agent work: pixel-grid loader, shimmering label, live elapsed timer |
| ThinkingState | Staged traces of agent steps (dossier, segments, plan, discovery, research, guide context) |
| StreamingText / StreamText | Kami Guide answers with sources, actions and follow-ups; selection rewrites |
| ApprovalCard | Landing questions (goals, stage) |
| ToolChips | Activity → Agent runs |
| TaskRows | Plan motions, boosts, account tasks, Hermes kanban |
| Chat | Kami Guide rail, email and DM conversation threads |
| PromptBar | Landing domain entry, Kami Guide composer (@ context, / commands, focus picker, dictation) |
| RecommendationCard | Overview next step, plan approval, distribution plan approval, resume campaign |
| ContextCards | Overview → Evidence |
| DiffTable | Reviewing a proposed dossier revision field by field |
| RecordsTable | Find companies, Creator CRM, Hermes sessions |
| FilterTable | Outbound ledger, suppressions, tasks |
| SidebarNav | The workspace navigation, with the kill switch in its footer |
| Search | ⌘K command palette |
| Flowchart | Overview → the go-to-market loop, with live step state |
| InsightCards | Overview → insights from server-side progress |
| CodeBlock | Agent run input/output, outbound content |
| FineTuneCard | Sales guardrails (send pace, daily cap); boost limits |
| SelectionActions | Rewrite any passage of an email or post draft with the agent that wrote it |

## Rules

- **One accent action per screen** (`<Button variant="accent">`); everything else is `secondary`, `ghost` or `quiet`.
- Every agent wait shows a LoadingState and/or a ThinkingState trace — never a bare spinner or "…".
- Every fetch shows loading (Skeleton / LoadingState), error (`Callout tone="error"`) and empty (`EmptyState`) states.
- Real-world actions (send, post, DM, boost) always confirm in a dialog that shows exactly what goes out.
- Accessible by default: labelled fields (`Field`), `role="alert"` errors, `aria-live` streams, radio-group segmented controls, keyboard-operable menus and dialogs.
