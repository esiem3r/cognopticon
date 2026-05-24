# Cognopticon

Cognopticon is a local-first cognitive operations console for unfinished work.

It scans a local workspace, turns projects into operational graph objects, detects failure modes like duplicate restarts and stale active work, and compiles bounded missions for humans or coding agents. The graph is the primary interface: nodes carry readiness, confidence, beliefs, proposals, missions, lineages, attractors, affordances, evidence, and safe actions.

Cognopticon has two honest modes:

- **Public demo:** sanitized, browser-first, and safe to show.
- **Local runtime:** private workspace state plus a localhost daemon that can record orchestration events and run tightly allowlisted local actions.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- Chromium dependencies for Playwright when running the full release gate

The repository is intended for GitHub/source distribution. `package.json` remains marked `private` to prevent accidental npm-registry publication while still allowing local installs, package dry-runs, and public source review.

## Run The Public Demo

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

The public demo uses sanitized data from `src/data/workspace-meta.json`, `src/data/projects.json`, `src/data/relationships.json`, and `src/data/workspace-roots.json`. It includes a self-node, launchable tool, research node, writing node, corpus node, duplicate variant cluster, stale active work, sleeping giant, archive fossil, and public-release blocker.

## Run On Your Own Files

```bash
npm run local:init -- --profile "$(hostname)" --roots "/path/to/projects,/another/root"
npm run scan
npm run analyze
npm run local
```

`npm run local` builds the app and starts the local daemon at `http://127.0.0.1:8787/`.

Private generated state lives under `.cognopticon/profiles/<profile>/`. The public app does not require or ship personal workspace data, and `public/workspace.json` is treated as a release hygiene failure because Vite would copy it into a public build.

## Daemon-Backed Orchestration Loop

The local loop is intentionally bounded:

```text
workspace scan
  -> analyzed workspace state
  -> browser graph and agency kernel
  -> user-approved mission or action
  -> daemon job/session/event
  -> event log and updated beliefs
```

The daemon is not a hidden autonomous agent. It provides a local bridge for:

- serving the analyzed workspace and recent daemon events
- opening an allowed path or editor target
- running approved verification commands
- starting a user-facing orchestrator session
- recording orchestrator task completion or reopening

Worker agents remain outside the daemon boundary. Mission packets are the handoff format, and unavailable adapters fall back to manual copy instead of pretending to dispatch.

## Codex Supervisory Goal

Use `/goal` for the supervising Codex instance as a compact operating objective:

```text
Act as Cognopticon's supervisory orchestrator: manage research, planning, worker implementation, review, verification, UX audit, and integration loops until the app reaches production-grade local-first quality without private data leaks or frontend slop.
```

Detailed standards live in `docs/codex-goal.md`, `docs/lifecycle-harness.md`, generated lifecycle packets, and the personal `cognopticon-lifecycle` skill.

## Device-Scoped Profiles

Cognopticon uses local profiles so different machines do not pollute each other. A profile owns its roots, scan output, analyzed workspace, daemon events, enrichments, mission packets, and lifecycle loop artifacts:

```text
.cognopticon/profiles/<profile>/
  state/workspace.raw.json
  state/workspace.json
  state/events.jsonl
  enrichments/
  missions/
  loops/
```

Choose a profile with `--profile` during init or with `COGNOPTICON_PROFILE=<profile>` when running commands.

## Architecture

```text
workspace input
  -> ProjectDossier scan/demo input
  -> CognopticonNode canonical model
  -> field model
  -> intelligence layer
  -> agency kernel
  -> graph-native UI
  -> mission/action layer
  -> outcomes and updated beliefs
```

Important modules:

- `src/model/*`: canonical node model, adapter, readiness, anomalies, selectors, actions
- `src/field/*`: signals, state vectors, lineages, attractors, attention, affordances
- `src/intelligence/*`: beliefs, proposals, mission compiler, diagnostics, policy
- `src/agency/*`: goals, capabilities, action bus, mission state machine, outcomes, adapters
- `src/overlays/*`: graph-native cockpit, glance cards, action ports, detail tray
- `daemon/`: secure localhost daemon for local actions

## Safety Model

Cognopticon is local-first. It does not require account auth for a private local install, but it does enforce capability authorization.

The daemon:

- binds to `127.0.0.1`
- serves the built local app from the daemon origin by default
- requires an explicit daemon token for configured dev-server origins
- only opens or runs inside configured roots
- only runs commands with an explicit daemon safety policy
- uses `shell: false`
- limits request and process output size
- caps queued job runtime
- logs sessions, jobs, task events, and failures to the active profile event log
- refuses destructive markers such as git mutation, delete, reset, push, commit, `--force`, and `-rf`

By default, daemon command execution is for verification-shaped work: approved `npm` scripts such as `test`, `lint`, and `validate:data`, or one explicit local Node script inside an allowed root.

When the daemon is offline, the browser app still works and offers safe fallbacks: copy path, copy command, and generate mission. Browser-only mode cannot run local commands.

## Mission Workflow

1. Inspect the graph.
2. Hover a node for a glance card.
3. Click a node for the NodeCockpit.
4. Review beliefs, proposals, and launch/action affordances.
5. Generate a mission from the node or from a proposal.
6. Approve a daemon-backed action, or hand the bounded packet to Codex, Claude Code, or another agent.
7. Record outcomes through the orchestrator/event log.
8. Rerun scan and analysis when local state changes.

## Commands

```bash
npm run validate:data
npm run validate:release
npm run validate:community
npm run validate:package
npm run validate:payload
npm run validate:local
npm run audit:deps
npm run lint
npm test
npm run build
npm run test:e2e
npm run check
npm run scan
npm run analyze
npm run enrich:packets
npm run lifecycle:packet -- --objective "Finish a bounded Cognopticon slice"
npm run release:checkpoint -- --remote
npm run sanitize:demo
npm run local:init
npm run local
```

## Final Verification

Pull requests and pushes to `main` run the same release gate in GitHub Actions.

```bash
npx playwright install --with-deps chromium
npm run release:checkpoint -- --remote
npm run check
```

`npm run release:checkpoint -- --remote` verifies the staged release payload, package artifact, and GitHub Action tags before a commit boundary. `npm run check` runs the public packaging gates in order:

```bash
npm run validate:data
npm run validate:release
npm run validate:community
npm run validate:package
npm run validate:payload
npm run validate:local
npm run audit:deps
npm run lint
npm test
npm run build
npm run test:e2e
```

## Security

Read `SECURITY.md` before sharing local runs or filing reports. Do not publish `.cognopticon/` state, daemon tokens, generated local workspace files, or logs that include private paths.

## Contributing And Support

Read `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SUPPORT.md` before opening public issues or pull requests. Use `docs/release-checklist.md` before publishing a branch, tag, package artifact, or demo recording.

## License

MIT. See `LICENSE`.

## Behavioral Claim

Unfinished work does not fail only because people lack discipline. It fails because state becomes invisible: context bloat, duplicate restarts, unclear next actions, verification gaps, public-release anxiety, unsafe agent handoff, and dormant high-substance work.

Cognopticon makes that state visible and turns it into navigable, agent-ready transformations.
