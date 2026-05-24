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
  planner.md
  mission.md
  reviewer.md
  verifier.md
  ux-auditor.md
  integrator.md
  final-report.md
```

Use the packet with another Codex terminal when a hands-off build/review/revise/verify loop is useful. The packet is intentionally local and ignored; it can mention private paths without contaminating the public repository.

Default roles:

- supervisor: owns scope, standards, assignments, and acceptance
- researcher: performs prior-art, license, and fit analysis before plan lock-in
- planner: turns research and intent into decision-complete worker scopes
- builder: implements the bounded slice
- reviewer: findings-first review
- verifier: independent gate runner
- ux-auditor: browser screenshot/product-quality audit
- integrator: reconciles changes and owns final polish

Prior-art research is required by default for substantial work. Use `--research off` only for small mechanical fixes and record why research was skipped.

Default gates:

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
- `npm run validate:daemon`
- `npm run validate:daemon-config`
- `npm run audit:ux`
- `npm run test:e2e`

The matching personal Codex skill is `cognopticon-lifecycle`. It keeps the workflow reusable across sessions and machines while Cognopticon records the artifacts per profile.

Public pull requests and pushes to `main` should pass `.github/workflows/check.yml`, which runs the same `npm run check` gate after `npm ci` and Playwright Chromium installation.
