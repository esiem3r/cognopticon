# Lifecycle Harness

Cognopticon treats recursive Codex work as a formal lifecycle, not a vague prompt loop. The supervising Codex instance should act as systems architect, project manager, and orchestrator; workers implement bounded slices, and reviewers/verifiers/auditors produce evidence before integration.

## Active `/goal`

Use a compact, parseable goal for the supervising instance:

```text
Act as Cognopticon's supervisory orchestrator: manage research, planning, worker implementation, review, verification, UX audit, and integration loops until the app reaches production-grade local-first quality without private data leaks or frontend slop.
```

The detailed standards live in lifecycle packets and docs, not in the `/goal` itself.

Generate a packet:

```bash
npm run lifecycle:packet -- --objective "Finish a bounded Cognopticon slice"
```

The packet is written to the active profile:

```text
.cognopticon/profiles/<profile>/loops/<run>/
  run.json
  supervisor.md
  researcher.md
  research-brief.md
  planner.md
  mission.md
  reviewer.md
  verifier.md
  ux-auditor.md
  integrator.md
  terminal-orchestrator.md
  terminal-agents.json
  handoff.md
  final-report.md
```

Use the packet with process-supervised fresh Codex terminal instances when a hands-off build/review/revise/verify loop is useful. The packet is intentionally local and ignored; it can mention private paths without contaminating the public repository.

`research-brief.md` is the plan-lock gate. It records source links, retrieval dates, licenses, maintenance signals, reuse decisions, rejected options, and fit risks for Cognopticon's local-first/private-profile/daemon-safety model. The researcher should check GitHub/web prior art before the planner locks direction, then choose dependency reuse, pattern borrowing, attribution-only reference, or no reuse. `terminal-orchestrator.md` and `terminal-agents.json` define the Codex-as-builder process fanout. `handoff.md` remains the pasteable manual fallback for a second Codex terminal; it points the worker to the mission, planner, and research artifacts without granting broad edit authority.

## Process-Supervised Codex Mode

When the user explicitly authorizes multi-agent, subagent, sub-subagent, autonomous lifecycle, recursive Codex, or "prompt Codex to prompt Codex" work, the supervising Codex should not merely simulate roles in one conversation.

Use the generated terminal contract:

```bash
node scripts/codex-terminal-loop.mjs --packet ".cognopticon/profiles/<profile>/loops/<run>"
node scripts/codex-terminal-loop.mjs --packet ".cognopticon/profiles/<profile>/loops/<run>" --launch
```

The first command prepares prompts and a launch script. The second runs fresh `codex exec` child processes with no tracked-file write authority by default and writes reports under the ignored packet directory. The read-only researcher receives Codex live web search by default, with global `--search` placed before the `exec` subcommand; use `--no-search` only for an explicitly offline provisional pass. If a packet is generated with `--research off`, the skip reason is recorded in the packet and the researcher role is available only when explicitly selected. If a child times out or exits without its report, the launcher writes a failure report artifact with log tails so the supervisor can review evidence instead of chasing a missing file. The verifier may receive workspace-write sandboxing only so gate commands can create temporary artifacts under the ignored packet directory.

Builder children are available but never launched by default. Select one only after the planner has produced a disjoint write scope:

```bash
node scripts/codex-terminal-loop.mjs --packet ".cognopticon/profiles/<profile>/loops/<run>" --roles terminal-verifier --allow-write --launch
node scripts/codex-terminal-loop.mjs --packet ".cognopticon/profiles/<profile>/loops/<run>" --roles terminal-builder --allow-write --launch
```

The root Codex session remains depth 0 supervisor and final integrator. Fresh Codex terminal children are depth 1 role workers. Read-only researcher and reviewer children launch by default while research is required; research-disabled packets default to reviewer-only launch unless the researcher is explicitly selected. Full verifier and builder children require explicit role selection plus `--allow-write` because their gates can write generated artifacts. A child may use its own `multi_agent_v1.spawn_agent` sidecars only when the manifest grants child-spawn permission, and those sidecars may use one bounded sub-subagent only when the parent defines a smaller objective, explicit stop condition, artifact path, and remaining depth 0. No depth 3. Child prompts must not combine `fork_context: true` with `agent_type`; pass needed context in the prompt when selecting an agent type.

Keep the product boundary strict: Cognopticon's browser app and daemon do not auto-spawn worker agents. They prepare mission packets, record approved local events, and expose manual handoff paths. Process-supervised Codex mode is an operator workflow outside the app/daemon dispatch path.

Default roles:

- supervisor: owns scope, standards, assignments, and acceptance
- researcher: performs prior-art, license, and fit analysis before plan lock-in
- research-brief: captures source, license, maintenance, reuse, and rejection evidence
- planner: turns research and intent into decision-complete worker scopes
- builder: implements the bounded slice
- reviewer: findings-first review
- verifier: independent gate runner
- ux-auditor: browser screenshot/product-quality audit
- integrator: reconciles changes and owns final polish
Fresh terminal children should report whether they used live subagents. Internal role labels do not count as delegation.

Prior-art research is required by default for substantial work. Use `--research off` only for small mechanical fixes or read-only review packets; include `--research-reason "..."` and generate a new research-enabled packet if the work starts to lock implementation direction. Use `--ux off` only when the packet cannot accept frontend changes; include `--ux-reason "..."`. Pass `--read-only` for review-only packets so generated mission instructions cannot drift into builder language.

Validate generated packet structure with:

```bash
npm run validate:lifecycle
```

Validate a filled research brief before plan lock with:

```bash
npm run validate:lifecycle -- --packet ".cognopticon/profiles/<profile>/loops/<run>" --complete-research
```

Default gates:

- `npm run validate:data`
- `npm run validate:release`
- `npm run validate:community`
- `npm run validate:package`
- `npm run validate:payload`
- `npm run validate:local`
- `npm run validate:lifecycle`
- `npm run audit:deps`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run build:pages`
- `npm run validate:pages`
- `npm run validate:daemon`
- `npm run validate:daemon-config`
- `npm run audit:ux`
- `npm run audit:a11y`
- `npm run test:e2e`

The matching personal Codex skill is `cognopticon-lifecycle`. It keeps the workflow reusable across sessions and machines while Cognopticon records the artifacts per profile.

Public pull requests and pushes to `main` should pass `.github/workflows/check.yml`, which runs the same `npm run check` gate after `npm ci` and Playwright Chromium installation. Pushes to `main` should also pass `.github/workflows/pages.yml`, which reruns the full gate, then builds, validates, uploads, and deploys only the sanitized static Pages artifact.
