# Getting Started

This is the first-stop path for a fresh Cognopticon checkout. Pick one mode before running anything else.

## Choose A Mode

| Mode | Use When | Data Source | Local Authority |
| --- | --- | --- | --- |
| Public demo | You want to inspect the app safely or share a public screen recording. | Sanitized fixtures in `src/data/`. | Browser only. No local commands, no private workspace API, no daemon probing. |
| Local runtime | You want Cognopticon to scan and operate on your own project roots. | `.cognopticon/profiles/<profile>/` generated on your machine. | Loopback daemon on `127.0.0.1`; allowlisted actions inside configured roots only. |
| Codex process loop | You want the supervising Codex session to launch fresh Codex terminal workers from a lifecycle packet. | Ignored lifecycle packet under `.cognopticon/profiles/<profile>/loops/<run>/`. | Terminal workflow only. It is not browser dispatch and not daemon worker authority. |

Start with the public demo unless you deliberately want local workspace access.

## Public Demo Path

```bash
npm install
npm run dev:demo
```

Open `http://127.0.0.1:5173/`.

The public demo uses sanitized fixtures, should show `10 nodes / 8 links / sample`, and should keep demo paths rooted under `/demo/`. `npm run dev:demo` runs Vite in static public-demo mode, so it swaps in the public adapters and does not probe the local daemon or workspace API. It can generate mission packets, copy manual handoff text, show runtime/offline state, and exercise the graph UI. It cannot run local commands.

For the static Pages artifact:

```bash
npm run build:pages
npm run validate:pages
```

The hosted Pages workflow runs `npm run check` before deploying `dist-pages/`, and the Pages build uses static public-demo adapters.

## Local Runtime Path

Initialize an explicit local profile and root list:

```bash
npm run local:init -- --profile "$(hostname)" --roots "/path/to/projects,/another/root"
npm run scan
npm run analyze
npm run enrich:packets
npm run local
```

Open `http://127.0.0.1:8787/`.

Local runtime writes private state under:

```text
.cognopticon/profiles/<profile>/
```

Do not commit or publish that directory. Do not put generated workspace data in `public/workspace.json`; the release gate treats that as a public-build leak.

The daemon is intentionally narrow:

- binds to `127.0.0.1`
- requires initialized profile roots
- uses `shell: false`
- opens or runs only inside configured roots
- runs verification-shaped allowlisted commands by default
- records jobs, sessions, and task events in the active private profile
- refuses destructive markers such as `--force`, `-rf`, `reset`, `push`, `commit`, and `delete`

Browser-only mode still works when the daemon is offline. It can copy paths/commands and generate mission packets, but it cannot run local commands.

`npm run enrich:packets` creates private agent-enrichment prompts under the active profile's ignored `missions/` directory. The packets include private project paths, so the command refuses public or tracked output directories.

## Codex Lifecycle Path

Use this when you are supervising build/review/verify loops from Codex itself:

```bash
npm run lifecycle:packet -- --objective "Finish a bounded Cognopticon slice"
npm run lifecycle:terminals -- --packet ".cognopticon/profiles/<profile>/loops/<run>"
```

Add `--launch` only when you want fresh `codex exec` child processes to run. Read-only researcher/reviewer prompts are the default while research is required. If a packet is generated with `--research off`, the skip reason is recorded and the researcher role becomes explicit-only. The researcher receives Codex live web search by default so prior-art and GitHub checks are real; add `--no-search` only when you deliberately want an offline provisional research pass. Full verifier and builder children are not launched by default; they require an explicit role and write grant because they can write generated artifacts:

```bash
npm run lifecycle:terminals -- --packet ".cognopticon/profiles/<profile>/loops/<run>" --roles terminal-verifier --allow-write --launch
npm run lifecycle:terminals -- --packet ".cognopticon/profiles/<profile>/loops/<run>" --roles terminal-builder --allow-write --launch
```

This workflow is outside the browser app and outside daemon dispatch. The browser mission drawer still provides manual handoff packets and does not start hidden worker agents. Terminal child prompts may use nested subagents only when the generated manifest grants that permission. The generated `launch-agents.sh` is executable and re-enters the Node launcher path. If a child times out or fails before writing its own report, the launcher writes a failure report artifact beside the terminal logs.

## Proof Commands

For a public release boundary:

```bash
npm run release:checkpoint -- --remote
npm run check
```

For targeted first-run proof:

```bash
npm run validate:local
npm run validate:private
npm run validate:daemon
npm run validate:daemon-config
npm run validate:pages
```

`validate:private` uses the active initialized profile, keeps raw scan/analyze artifacts temporary, and writes only a redacted count-level proof report under `.cognopticon/profiles/<profile>/proofs/`.

For documentation/community surfaces:

```bash
npm run validate:community
npm run validate:release
```

## What Not To Share

Keep these out of public issues, pull requests, package artifacts, screenshots, and demo recordings:

- `.cognopticon/` profile state
- daemon tokens
- generated local workspace JSON
- private paths
- local logs with secrets or private project names
- screenshots that reveal private projects

Use `SECURITY.md` for vulnerability reports and `SUPPORT.md` for safe support requests.
