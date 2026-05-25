# Security Model

Cognopticon is local-first. The public repository ships with sanitized demo data; private generated workspace files are ignored.

Ignored private state:

- `.cognopticon/`
- generated mission packets

New local runs write private state to `.cognopticon/profiles/<profile>/`. `public/workspace.json` is treated as a release hygiene failure because it would be copied into a public build.

Profile selection fails closed. A requested named profile must be declared in `.cognopticon/config.json` with explicit `allowedRoots`; typos and rootless profile declarations abort rather than falling back to the repository root. Profile path overrides are constrained to `.cognopticon/profiles/<profile>/`.

The local daemon is a convenience bridge, not an internet service and not a general shell. It requires initialized local runtime config for normal startup, binds to `127.0.0.1`, accepts configured local browser origins, checks configured roots, checks command allowlists, uses `shell: false`, opens paths through platform launchers without shell command strings, limits request size, retained process output, persisted job-output event text, and event snapshot replay, caps job runtime, logs action attempts, and refuses destructive commands.

When a dev-server origin needs daemon access, the browser keeps the daemon token in tab-scoped `sessionStorage` and sends it in the `X-Cognopticon-Token` header. The daemon rejects `daemonToken` query parameters so tokens do not ride along in daemon request URLs, logs, history, or copied links.

Browser-only mode cannot run local commands. It offers safe fallbacks: copy path, copy command, and generate mission.

Process-supervised Codex terminal loops are an operator workflow outside the app and daemon. The root Codex process may launch fresh `codex exec` children from an ignored lifecycle packet, but those children must not claim daemon authority, browser dispatch, or wider filesystem rights than their terminal contract grants.

Allowed daemon work:

- read the current analyzed workspace
- stream recent daemon events
- open a path inside an allowed root
- open the configured editor inside an allowed root
- run approved verification commands
- start an orchestrator session and record user-facing task events

Unsupported actions:

- delete files
- arbitrary shell strings
- git commit/push/reset
- command flags like `--force` and `-rf`
- commands outside allowlist
- paths outside allowed roots
- exposing the daemon outside loopback
- claiming an agent was dispatched when the active adapter is manual copy
- confusing process-supervised Codex children with Cognopticon daemon-dispatched workers

Remaining operator responsibilities:

- Configure `allowedRoots` to the smallest useful workspace set.
- Keep private `.cognopticon/` state out of commits and demos.
- Run `npm run validate:release` before public packaging.
- Review mission packets before handing them to an agent.
- Treat daemon approvals as local machine authority. The daemon reduces accidental blast radius; it is not a substitute for OS permissions, backups, or human review.
