---
name: review_rubric
description: The checklist every outreach draft must pass before the founder can approve it — email, X posts and DMs. Use it to self-check drafts; the app runs the same checks in code.
---

# Review rubric

The app enforces the email checks in `web/lib/salesReview.ts`; a draft that fails cannot be approved. Agents that draft should self-check against this list so drafts pass first time. Walk every box; never answer "is this good?" in general.

## Email (all must pass)
- [ ] Subject present, under 60 characters, no clickbait or ALL CAPS.
- [ ] Body at most 150 words, plain text, 3–5 sentences.
- [ ] Exactly one call to action.
- [ ] Step 1 opens with a real, dated signal (see `business_rules` → Signal freshness) and carries its source URL in `signal_ref`.
- [ ] Follow-ups (step 2+) add new value — never "just bumping".
- [ ] Only approved claims; no invented metrics, customers or logos.
- [ ] Opt-out line present ("reply unsubscribe and I won't follow up").
- [ ] Greets a person by name only when the contact's name is known; otherwise a neutral greeting.

## X post (all must pass)
- [ ] The point lands in the first 8 words; at most 280 characters.
- [ ] No links (they are blocked at publish time).
- [ ] Every claim traceable to the dossier or evidence; no "guaranteed" claims.
- [ ] Useful on its own; product mention only where natural.

## DM (all must pass)
- [ ] 1–3 sentences, individual to this person (references something they actually posted).
- [ ] No links in the first message; one clear ask.
- [ ] Honest: written for the founder to send; never denies AI assistance if asked.

## Verdict
`{ approved, score, failed_criteria[], required_fixes[] }`. `approved` only when every box passes. Each `required_fix` is an imperative edit concrete enough to apply without questions (e.g. "Cut the body from 212 to under 150 words").
