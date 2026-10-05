---
name: reddit_distribution
description: Finding relevant subreddits/threads and drafting value-first comments for Kami Marketing.
---

# Reddit distribution

## When to use
Finding relevant subreddits/threads and drafting value-first comments.

## Access
Browser or research tools. **Never auto-post.** Manual founder action only.

## Procedure
1. Identify communities where the company's problem is discussed.
2. Follow `viral_formats`: research current Reddit comment/post patterns, pick one, set `format_used` + `format_why`.
3. Read subreddit rules; put promotion bans in `risks`.
4. Draft a helpful answer that would stand alone without a product pitch (unless the format and rules allow a soft mention).
5. Prefer a real thread `https://…` URL. If none: `manual://paste-thread-url` with `evidence` starting `[needs_url]`.
6. Never spam. Prefer communities the founder already participates in.

## Output schema
platform=`reddit` opportunity object including `format_used` and `format_why`.
