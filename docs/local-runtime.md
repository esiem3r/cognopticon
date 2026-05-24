# Local Runtime

`npm run local` builds the app and starts `daemon/src/index.js` on `127.0.0.1:8787`.

Initialize private config:

```bash
npm run local:init -- --profile "$(hostname)" --roots "/path/to/projects,/another/root"
```

The daemon reads `.cognopticon/config.json`.

Run `npm run local:init` before `npm run local`, `npm run scan`, or `npm run analyze`. Profile-scoped commands fail closed when no local profile has been initialized.

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

Set `COGNOPTICON_PROFILE=<profile>` to scan, analyze, enrich, or run a different machine/profile. Unknown profile names and undeclared `activeProfile` values fail closed instead of scanning the repo root. A named profile is valid only when `.cognopticon/config.json` declares it with explicit `allowedRoots`, and any profile path overrides must remain under `.cognopticon/profiles/<profile>/`. `public/workspace.json` is not the local runtime target; leaving personal workspace data there is a release hygiene failure.

During development, prefer `npm run local` for daemon-backed flows. If a Vite dev server must call the daemon, add that origin through local config and open the app with `#daemonToken=<token from .cognopticon/config.json>`. The fragment is stripped from the visible URL and the browser keeps the token in `sessionStorage` for the current tab. Daemon API calls send the token in the `X-Cognopticon-Token` header; query-string tokens are rejected.

`npm run validate:daemon` is the release smoke test for local runtime mode. It requires a built `dist/`, starts the real daemon on an ephemeral loopback port with a temporary profile under the OS temp directory, verifies built assets, dev-origin token enforcement, profile listing, profile workspace loading, browser app startup from the daemon origin, a UI-triggered allowlisted `npm test`, a direct local `node` job with `shell: false`, URL-encoded job polling, and a persisted event log containing successful jobs plus a redacted outside-root policy rejection.

`npm run validate:daemon-config` closes the on-disk bootstrap side of the same claim. It runs `local:init` in an OS temp directory for active and secondary profiles, copies the built `dist/`, starts the daemon from the generated `.cognopticon/config.json`, and verifies profile isolation, generated daemon token enforcement, active workspace loading, allowlisted job execution, encoded job polling, and redacted outside-root policy failures without reading the user's real `.cognopticon` state.

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

Private state remains under `.cognopticon/`. The daemon requires initialized local runtime config for normal startup, then serves only the active profile workspace or the sanitized demo fallback. Legacy `.cognopticon/state/workspace.json` and `public/workspace.json` are not daemon workspace sources.
