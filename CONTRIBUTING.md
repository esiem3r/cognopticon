# Contributing to Cognopticon

Thanks for helping make Cognopticon stronger. This project is local-first software, so useful contributions have to protect two things at once: public reproducibility and private workspace safety.

## Ground Rules

- Do not post `.cognopticon/` state, daemon tokens, private paths, screenshots with private project names, or logs that include secrets.
- Do not attach generated local workspace JSON or private screenshots to public reports.
- Keep public demo data sanitized and rooted under `/demo/`.
- Treat daemon authority as security-sensitive. New local actions need explicit allowlist behavior, bounded roots, `shell: false`, output limits, and tests.
- Keep worker-agent behavior behind explicit mission or orchestrator boundaries. The daemon is not a hidden autonomous worker.

## Local Setup

For a first checkout, read `docs/getting-started.md` to choose public demo mode or private local runtime mode before running commands.

```bash
npm install
npm run dev:demo
```

Open `http://127.0.0.1:5173/` for the sanitized demo.

For local profile work:

```bash
npm run local:init -- --profile "$(hostname)" --roots "/path/to/projects"
npm run scan
npm run analyze
npm run local
```

Generated local profile state belongs under `.cognopticon/profiles/<profile>/` and must stay out of public commits.

## Before Opening A Pull Request

Run the full release gate:

```bash
npm run check
```

For UI changes, include the relevant desktop and mobile screenshots or describe the Playwright coverage that proves the behavior. For daemon, pipeline, or local-profile changes, include the exact command output and the public/private boundary you verified.

## Useful Contribution Areas

- Better local workspace analysis that does not leak personal data.
- Stronger graph-native UX for project state, proposals, missions, and verification.
- Safer daemon capabilities with narrow allowlists and clear fallbacks.
- More adversarial tests for release hygiene, payload drift, and mobile layout.
- Documentation that helps a new local user understand what runs on their machine.

## Security Reports

Read `SECURITY.md` before reporting vulnerabilities. Do not include exploit details or private workspace data in public issues.
