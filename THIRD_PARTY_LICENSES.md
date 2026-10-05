# Third-party licenses

Kami first-party code and brand assets are MIT — see [LICENSE](LICENSE), [NOTICE](NOTICE), and [assets/README.md](assets/README.md).

This file lists third-party terms that are **not** covered by that MIT grant. Exact versions: `web/package-lock.json`, `video/package-lock.json`.

---

## Remotion

| | |
|--|--|
| **Packages** | `remotion`, `@remotion/cli`, `@remotion/google-fonts`, `@remotion/transitions` |
| **Where** | [`video/`](video/) only (optional demo tooling) |
| **License** | [Remotion License](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) (source-available; **not** OSI-MIT) |
| **FAQ** | https://www.remotion.dev/docs/license/faq |

- **Free License:** individuals, nonprofits, for-profits with **≤3 people** (commercial video allowed)
- **Company License:** required at **4+** people (see Remotion terms for agency/client headcount aggregation)
- Shipping a finished MP4 alone does not transfer Remotion rights; **running** Remotion does

Community Edition (`web/` + Hermes) does **not** require Remotion. Details: [video/README.md](video/README.md).

---

## sharp / libvips (LGPL)

| | |
|--|--|
| **Packages** | `sharp`, `@img/sharp-libvips-*` (transitive via Next.js image pipeline) |
| **Licenses** | Apache-2.0 (sharp) + **LGPL-3.0-or-later** (libvips) |

**Notice:** This product may use libvips via sharp. libvips is Copyright (c) the libvips contributors and licensed under the GNU Lesser General Public License v3.0 or later.

Kami does not modify libvips source. Unmodified dynamic linking / binary use as shipped by npm is the intended use. If you modify libvips or redistribute a modified libvips, you must comply with LGPL-3.0 (provide source / corresponding notice as required).

- LGPL-3.0: https://www.gnu.org/licenses/lgpl-3.0.html  
- libvips: https://github.com/libvips/libvips  

---

## mediabunny (MPL-2.0)

| | |
|--|--|
| **Packages** | `mediabunny`, `@mediabunny/*` (transitive via Remotion) |
| **License** | Mozilla Public License 2.0 |

File-level weak copyleft: unmodified use is fine; modifications to MPL-covered files must remain under MPL-2.0 and source made available as required.

- MPL-2.0: https://www.mozilla.org/en-US/MPL/2.0/  

---

## caniuse-lite (CC-BY-4.0)

| | |
|--|--|
| **Package** | `caniuse-lite` (transitive; browser compat data) |
| **License** | Creative Commons Attribution 4.0 International |

Attribution: browser compatibility data from [Can I Use](https://caniuse.com/) / caniuse-lite contributors. If you redistribute the caniuse-lite database itself, include CC-BY-4.0 attribution.

- CC-BY-4.0: https://creativecommons.org/licenses/by/4.0/  

---

## Google Fonts (SIL OFL 1.1)

| Family | How loaded |
|--------|------------|
| Domine | `next/font/google`, `@remotion/google-fonts` |
| Source Sans 3 | same |
| Space Mono | same |

These families are typically under the **SIL Open Font License 1.1**. Kami does not vendor `.woff` / `.ttf` files in git; fonts are fetched at build/runtime via Google Fonts / Next font tooling.

- OFL 1.1: https://openfontlicense.org/  
- Fonts: https://fonts.google.com/  

---

## Direct OSS dependencies (summary)

Common direct deps used by Community Edition (typical SPDX; confirm in lockfile):

| Package | Typical license |
|---------|-----------------|
| `next` | MIT |
| `react` / `react-dom` | MIT |
| `@supabase/supabase-js` | MIT |
| `@langfuse/*` | MIT / Apache-2.0 (see package) |
| `@opentelemetry/sdk-trace-node` | Apache-2.0 |
| `typescript` (dev) | Apache-2.0 |

Hermes Agent (Nous Research) is a **runtime dependency**, not vendored in this repository. Refer to the Hermes project’s own license when you install it.

---

## Trademark note

Unused Next.js / Vercel create-app template SVGs were **removed** from `web/public/` (2026-07-29). Do not re-add third-party trademarks without permission.
