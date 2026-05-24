# Security Model

Cognopticon is local-first. The public repository ships with sanitized demo data; private generated workspace files are ignored.

Ignored private state:

- `.cognopticon/`
- generated mission packets

New local runs write private state to `.cognopticon/profiles/<profile>/`. `public/workspace.json` is treated as a release hygiene failure because it would be copied into a public build.

The local daemon is a convenience bridge, not an internet service and not a general shell. It binds to `127.0.0.1`, accepts configured local browser origins, checks configured roots, checks command allowlists, uses `shell: false`, limits request/output sizes, caps job runtime, logs action attempts, and refuses destructive commands.

Browser-only mode cannot run local commands. It offers safe fallbacks: copy path, copy command, and generate mission.

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

Remaining operator responsibilities:

- Configure `allowedRoots` to the smallest useful workspace set.
- Keep private `.cognopticon/` state out of commits and demos.
- Run `npm run validate:release` before public packaging.
- Review mission packets before handing them to an agent.
- Treat daemon approvals as local machine authority. The daemon reduces accidental blast radius; it is not a substitute for OS permissions, backups, or human review.
