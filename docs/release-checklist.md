# Public Release Checklist

Use this checklist before publishing a branch, pull request, tag, package artifact, or demo recording.

## Public Surfaces

- `README.md` explains public demo mode, local runtime mode, safety boundaries, commands, and final verification.
- README and `package.json` declare the supported Node.js/npm install floor.
- `package.json` remains `private` to prevent accidental npm-registry publication.
- `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SUPPORT.md` are present.
- GitHub issue forms and the pull request template warn against private workspace data.
- Security coordination routes users to `SECURITY.md` and prevents public vulnerability details.
- Public demo fixtures live in `src/data/` and use `/demo/` paths only.

## Private Data Boundary

- No `.cognopticon/` state is tracked.
- No daemon tokens, private paths, generated workspace JSON, or local logs are tracked.
- No `public/workspace.json` exists, because Vite would ship it.
- Screenshots and demo recordings are taken from the sanitized public demo unless intentionally kept private.

## Verification

Run:

```bash
npm run release:checkpoint -- --remote
npm run check
```

The checkpoint must report its release mode, release file count, zero unstaged/untracked release files, package artifact entries, and successful remote GitHub Action tag checks. The full gate must include:

- `npm run validate:data`
- `npm run validate:release`
- `npm run validate:community`
- `npm run validate:package`
- `npm run validate:payload`
- `npm run validate:local`
- `npm run audit:deps`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`

Do not call the release ready until the exact gate output is recorded in the lifecycle final report or pull request.

## Human Review

- Review package contents with `npm pack --dry-run --json` or `npm run validate:package`.
- Review staged release payload with `npm run validate:payload`.
- Ask an independent reviewer or verifier to check privacy, daemon authority, docs, mobile UX, and final command evidence.
