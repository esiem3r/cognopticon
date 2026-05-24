# Local Runtime

`npm run local` builds the app and starts `daemon/src/index.js` on `127.0.0.1:8787`.

Initialize private config:

```bash
npm run local:init -- --profile "$(hostname)" --roots "/path/to/projects,/another/root"
```

The daemon reads `.cognopticon/config.json`.

Default configuration:

- host: `127.0.0.1`
- port: `8787`
- allowed browser origins: the daemon-served app origin by default
- dev-server origins: allowed only when explicitly configured and accompanied by the daemon token
- allowed commands: `npm`, `node`
- editor command: `code`
- agent/job cap: bounded threads and runtime

Local generated data is profile-scoped:

```text
.cognopticon/profiles/<profile>/
  state/workspace.raw.json
  state/workspace.json
  state/scan-review.json
  state/events.jsonl
  enrichments/
  missions/
  loops/
```

Set `COGNOPTICON_PROFILE=<profile>` to scan, analyze, enrich, or run a different machine/profile. Unknown profile names fail closed instead of scanning the repo root. `public/workspace.json` is not the local runtime target; leaving personal workspace data there is a release hygiene failure.

During development, prefer `npm run local` for daemon-backed flows. If a Vite dev server must call the daemon, add that origin through local config and open the app with `?daemonToken=<token from .cognopticon/config.json>`; the browser stores the token locally for subsequent daemon calls.

Capabilities:

- health check
- workspace load
- event stream snapshot over server-sent events
- open path inside allowed roots
- open editor inside allowed roots
- run allowlisted command with `shell: false`
- create, inspect, and cancel daemon jobs
- start an orchestrator session
- record orchestrator task completion and reopening

Command policy:

- `npm` is constrained to approved scripts such as `test`, `lint`, and `validate:data` unless config narrows or extends the list.
- `node` must run one explicit local `.js` or `.mjs` script inside an allowed root.
- destructive markers are rejected before spawn.

Private state remains under `.cognopticon/`. With profile runtime enabled, the daemon serves only the active profile workspace or the sanitized demo fallback. Legacy `.cognopticon/state/workspace.json` and `public/workspace.json` are only fallback compatibility paths for non-profile daemon configurations.
