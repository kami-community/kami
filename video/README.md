# Kami video (`video/`)

Remotion project for demo/marketing montages. **Not required** to run Kami Community Edition (`web/` + Hermes).

## License (important)

| Piece | License |
|-------|---------|
| Kami-authored files in this folder (`src/`, configs) | MIT (same as root `LICENSE`) |
| **Remotion** and `@remotion/*` packages | [Remotion License](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) — **not** MIT |

Root MIT does **not** relicense Remotion. Anyone who installs or runs this package must comply with Remotion’s terms:

- **Free License** — individuals, nonprofits, or for-profits with **≤3 people** (commercial video allowed)
- **Company License** — required if the for-profit org (or aggregated collab headcount) is **4+** → [remotion.pro/license](https://www.remotion.pro/license)

Kami’s core team size at publish time is **2** → Free License eligible. Re-check if the team grows or you co-build Remotion projects with larger companies.

See also [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md).

## Commands

```bash
cd video
npm install
npm run dev      # Remotion Studio
npm run render   # out/montage.mp4
```

`out/` is gitignored.
