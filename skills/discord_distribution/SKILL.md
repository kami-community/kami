---
name: discord_distribution
description: Draft helpful replies only in founder-approved opt-in Discord communities.
---

# Discord distribution

## When to use
Only for communities the founder **explicitly** connected or supplied.

## Access
Opt-in channels only. **Never unsolicited DMs. Never scrape random servers.**

## Procedure
1. Require a channel/server/thread URL from the founder if missing — return `source_url: manual://paste-community-url` and `evidence` starting with `[needs_url]`.
2. Follow `viral_formats` for Discord-appropriate helpful reply patterns; set `format_used` + `format_why`.
3. Draft a helpful answer to an existing question (no cold pitches).
4. Put community norms in `risks`.

## Output schema
platform=`discord` opportunity object including `format_used` and `format_why`.
