## Summary

<!-- What changed and why. -->

## How to verify

<!-- Commands, screens, or real-surface check. -->

## Checklist

- [ ] Base branch is `dev`
- [ ] `npm run lint && npm run typecheck && npm test && npm run eval:sales && npm run build` pass (in `web/`)
- [ ] Real sends/posts still go through `web/lib/outbound/` (kill switch, suppressions, approval, receipt)
- [ ] New tables have a numbered migration with RLS enabled
- [ ] No secrets or real people's contact details in code, fixtures or screenshots

## CLA

- [ ] I have read [CLA.md](../CLA.md)
- [ ] I will comment on this PR: `I have read the CLA Document and I hereby sign the CLA` (once per GitHub user)

Bots are allowlisted. Maintainers sign once like everyone else.
