---
name: x_distribution
description: Finding X (Twitter) conversations and drafting posts/replies for Kami Marketing distribution opportunities.
---

# X distribution

## When to use
Finding X (Twitter) conversations and drafting posts/replies for Kami Marketing distribution opportunities.

## Access
- Browser research or user-owned X/search tools when available.
- **No direct publishing credentials.** Return structured opportunities only. The Kami app policy gate publishes after founder approval.

## Procedure
1. Read company dossier, campaign goal, and angle.
2. Follow the `viral_formats` skill: research current X formats, pick **one**, note `format_used` + `format_why`.
3. Find 1 relevant public conversation **or** draft 1 standalone post in that format.
4. Prefer usefulness and specificity. Product mention only if natural. No generic “we built X” pitches unless the format is explicitly a demo.
5. Prefer `source_url` as `https://…` to a specific post/thread. If none: `manual://paste-x-thread-or-post-url` with `evidence` starting `[needs_url]`.
6. Never claim a post was published. Manual-first.

## Output schema
JSON object matching distribution_opportunities fields (platform=`x`), including `format_used` and `format_why`.
