# Kami — Copyright & License Audit

**Date:** 2026-07-29 (updated same day — medium findings fixed)  
**Scope:** [`saranambiar/kami`](https://github.com/saranambiar/kami) (`dev`)  
**Sibling note:** Marketing site [`Website-for-Kami`](https://github.com/VaradDurge/Website-for-Kami) called out separately  

> Not legal advice. Hygiene checklist for OSS compliance and future risk.

---

## Verdict

**No evidence of stolen or pasted third-party product code, UI assets, or playbooks in this repo.**

First-party code is **MIT** (`LICENSE`, © 2026 Kami contributors). Remotion is carved out and documented. Logo provenance, leftover Next/Vercel SVGs, and third-party notices are addressed.

| Metric | Result |
|--------|--------|
| Stolen / pasted code | **0 found** |
| First-party license | **MIT** |
| High findings | **Mitigated** (Remotion carve-out + Free License for ≤3) |
| Medium findings | **Fixed** (2026-07-29) |

---

## What’s clean

| Area | Status |
|------|--------|
| First-party code (`web/`, `skills/`, `agents/`, docs, scripts) | MIT; appears original |
| Skills & agents | Short original playbooks — not pasted books/blogs |
| Okara / Cal AI / Cluely | Research notes only (“study, don’t copy”) |
| Hermes / Nous | Text dependency refs; no logos or partner claims; not vendored |
| Video compositions | Code-drawn Remotion scenes; no stock footage / audio beds |
| Fonts | Domine, Source Sans 3, Space Mono via `next/font` / Remotion Google Fonts (typical OFL); not checked in as binary font files |
| GPL / AGPL in first-party or direct deps | None found |
| Brand logos | Provenance in [`assets/README.md`](../assets/README.md) |
| `web/public/` trademarks | Next/Vercel template SVGs **removed** |
| Third-party notices | [`NOTICE`](../NOTICE) + [`THIRD_PARTY_LICENSES.md`](../THIRD_PARTY_LICENSES.md) |

---

## Findings

### High — mitigated (2026-07-29)

| Issue | Status | What we did |
|-------|--------|-------------|
| **Remotion is not MIT** | **Mitigated for current 2-person team** | Free License covers ≤3 people. Added LICENSE Remotion exception, [`video/README.md`](../video/README.md), [`THIRD_PARTY_LICENSES.md`](../THIRD_PARTY_LICENSES.md). **Action when team hits 4+:** buy [Remotion Company License](https://www.remotion.pro/license) or stop using `video/`. |

### Medium — fixed (2026-07-29)

| Issue | Status | What we did |
|-------|--------|-------------|
| **Kami logo provenance** | **Fixed** | [`assets/README.md`](../assets/README.md) + [`web/public/README.md`](../web/public/README.md) — authors, rights, MIT |
| **Unused Next / Vercel SVGs** | **Fixed** | Deleted `next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg` from `web/public/` |
| **No THIRD_PARTY / NOTICE** | **Fixed** | Added [`NOTICE`](../NOTICE); expanded [`THIRD_PARTY_LICENSES.md`](../THIRD_PARTY_LICENSES.md) for Remotion, sharp/libvips (LGPL), mediabunny (MPL), caniuse-lite (CC-BY), Google Fonts (OFL) |

### Low — fixed / documented (2026-07-29)

| Issue | Status | What we did |
|-------|--------|-------------|
| **Missing `license` field** | **Fixed** | `"license": "MIT"` on root / `web/` / `video/` `package.json` |
| **Default Next favicon** | **Fixed** | Kami wordmark icons in `web/app/` + `web/public/favicon.ico` |
| **Eval brand names** | **Documented (kept on purpose)** | Real domains in [`web/evals/e2e/fixtures/companies.json`](../web/evals/e2e/fixtures/companies.json) are **live research targets** for the gold-standard harness — not UI logos, not partners. Added [`fixtures/NOTICE.md`](../web/evals/e2e/fixtures/NOTICE.md). Do not list them in marketing. |
| **Name “Kami”** | **Research filed** | [`docs/trademark-clearance-notes.md`](trademark-clearance-notes.md) — collision with edtech [kamiapp.com](https://kamiapp.com/). Not a clearance. Attorney still needed before filing. |

### Outside repo — Website-for-Kami (fixed 2026-07-29)

| Issue | Status | What we did |
|-------|--------|-------------|
| **16VC logo** | **Fixed** | Removed `public/16vc-logo.png` and Contact UI usage; noted in `public/ASSETS.md` |
| **Team photos** | **Documented** | Provenance in Website `public/ASSETS.md` (founders’ own likeness) |
| **“Inspired by arguslabs.in”** | **Fixed** | Removed from Website README; personal ArgusLabs / Mirage links on Contact remain (founders’ own sites) |

### Medium — fixed (2026-07-29, second pass)

| Issue | Status | What we did |
|-------|--------|-------------|
| **Verbatim journalism in `references/research-context.md`** | **Fixed** | Replaced extensive verbatim excerpts from TechCrunch, Forbes, Inc., Wikipedia with summaries + source links. Revenue figures and dates kept as factual data points only. |
| **GrowthX handbook content in `references/research-context.md`** | **Fixed** | Replaced full rubric reproduction with a link to the handbook URL + summary of scoring priorities. |

### Info

| Issue | Detail |
|-------|--------|
| **`AGENTS.md` GrowthX reference** | Line 61 links to the handbook and summarizes the key constraint. Acceptable as a reference — does not reproduce the full rubric. |

---

## Recommended fixes

### Done

1. Remotion High finding — LICENSE exception + `video/README.md` + third-party docs  
2. Delete unused Next/Vercel SVGs  
3. `"license": "MIT"` on package.json files  
4. Logo provenance under `assets/README.md`  
5. `NOTICE` + expanded `THIRD_PARTY_LICENSES.md`  

### Optional / later

- Keep eval brand names out of public marketing  
- Trademark clearance search on “Kami” before big brand spend  

~~Replace favicon~~ — **done** (Kami wordmark icons).

### Ongoing

- Don’t re-add third-party trademarks to `web/public/` without permission  
- Don’t ship Okara / competitor UI or assets  
- If team grows to 4+: Remotion Company License or drop `video/`  

---

## Outside this repo — Website-for-Kami

Addressed 2026-07-29 in the marketing repo: 16VC mark removed, photo provenance filed, arguslabs “inspired by” line removed from README.

Remaining: only re-add investor logos with **written** permission.

---

## License map (major pieces)

| Component | License | Notes |
|-----------|---------|--------|
| Kami first-party | **MIT** | Root `LICENSE` |
| Kami logos | **MIT** | `assets/README.md` |
| Hermes Agent (runtime) | Not in repo | Integration/docs only |
| Next.js, React, Supabase JS | MIT (typical) | Direct web deps |
| sharp / libvips | Apache-2.0 + LGPL-3.0-or-later | Documented in THIRD_PARTY |
| Remotion | Remotion License (not OSI-MIT) | `video/` toolchain |
| mediabunny | MPL-2.0 | Remotion transitive |
| caniuse-lite | CC-BY-4.0 | Transitive |
| Google Fonts used | SIL OFL 1.1 (typical) | Loaded at build/runtime |

---

## Checked areas

- `LICENSE`, `NOTICE`, `THIRD_PARTY_LICENSES.md`, README license claim  
- `package.json` / lockfiles (root, `web/`, `video/`)  
- `assets/`, `web/public/`, `web/app/favicon.ico`  
- `skills/`, `agents/` for pasted copyrighted content  
- `video/` for stock media  
- Docs / `AGENTS.md` / `DESIGN.md` for inspiration vs asset copying  
