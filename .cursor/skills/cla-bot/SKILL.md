---
name: cla-bot
description: Set up, debug, and operate the Kami CLA GitHub Action. Use when adding CLA checks, unsigned-contributor PR failures, cla.json signatures, allowlists, Enterprise relicensing, or CLA.md edits.
---

# Kami CLA bot

## What it is

GitHub Action (`.github/workflows/cla.yml`) asks every **human** committer on a PR to sign [CLA.md](../../../CLA.md) by commenting:

```text
I have read the CLA Document and I hereby sign the CLA
```

Signatures are appended to `signatures/version1/cla.json` on branch **`cla-signatures`**. That grant includes the right to relicense (possible Kami Enterprise) while Community Edition stays MIT.

Action: `badideasforsale/cla-github-action` pinned by commit SHA in `cla.yml`. Do not float `@v3` or switch back to the archived `contributor-assistant/github-action` without a maintainer decision.

## When a PR is blocked

1. Confirm `.github/workflows/cla.yml` is on the **default branch**, and that the default branch is `dev`. Since November 2025, `pull_request_target` runs the workflow file from the default branch, not from the pull request base. A copy that exists only on another branch never runs.
2. Ask unsigned users to paste the sign sentence (exact string). Then comment `recheck` if the check stays red.
3. If the Action cannot push signatures: `cla-signatures` must exist and must **not** be protected. The workflow's own `permissions:` block (`contents: write`) overrides the org's read-only default token, so no Actions setting needs changing.
4. Never create `cla.json` by hand (the action will fail).
5. Do not allowlist humans to skip signing.

## Allowlist

Only bots: `bot*`, `cursor[bot]`, `cursoragent`, `dependabot[bot]`, `github-actions[bot]`, `renovate[bot]`.

`@saranambiar` and `@VaradDurge` sign once like external contributors.

## Changing the CLA text

1. Edit `CLA.md`.
2. Bump storage path to `signatures/version2/cla.json` if the grant terms changed (so old signatures do not silently cover new terms).
3. Keep CODEOWNERS on `/CLA.md` as both maintainers.

## New CLA version checklist

- [ ] Terms reviewed by both maintainers
- [ ] `path-to-document` still points at `dev` (or the live default)
- [ ] Signature path version bumped if legally needed
- [ ] CONTRIBUTING.md and PR template still match the sign phrase
