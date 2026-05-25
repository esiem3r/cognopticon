# Codex Goal Setup

Cognopticon's `/goal` should be compact enough for Codex to parse as an active objective.

Use:

```text
Act as Cognopticon's supervisory orchestrator: manage research, planning, worker implementation, review, verification, UX audit, and integration loops until the app reaches production-grade local-first quality without private data leaks or frontend slop.
```

Do not put the whole product manifesto into `/goal`. Put detailed standards in lifecycle packets, docs, tests, and the `cognopticon-lifecycle` skill.

## Supervisory Pattern

- `/goal`: durable role and end state.
- `supervisor.md`: loop owner and acceptance authority.
- `researcher.md`: prior-art and license gate.
- `research-brief.md`: source links, retrieval dates, license compatibility, maintenance signals, reuse decisions, rejected options, and plan-lock evidence.
- `planner.md`: decision-complete implementation plan.
- `mission.md`: bounded builder task.
- `reviewer.md`: findings-first critique.
- `verifier.md`: command/test evidence.
- `ux-auditor.md`: browser screenshot/product-quality evidence.
- `integrator.md`: accept, reject, or send back into another loop.
- `terminal-orchestrator.md`: process-supervised fresh Codex terminal contract.
- `terminal-agents.json`: machine-readable child terminal roles, scopes, budgets, and artifact paths.
- `handoff.md`: bounded manual fallback prompt for a second Codex terminal.
- `final-report.md`: human review packet.

Generate a packet with:

```bash
npm run lifecycle:packet -- --objective "Describe the next bounded Cognopticon objective"
```

The packet is private local state under `.cognopticon/profiles/<profile>/loops/<run>/`.

Run `npm run validate:lifecycle` to prove the packet still includes the structured research brief, bounded handoff, and release-gate evidence trail. Run `npm run validate:lifecycle -- --packet "<runDir>" --complete-research` to prove the research brief has been filled before the planner locks direction.

When the user authorizes required multi-agent, subagent, sub-subagent, autonomous lifecycle, recursive Codex, or "prompt Codex to prompt Codex" mode, use the terminal contract instead of simulating roles in the supervising session:

```bash
node scripts/codex-terminal-loop.mjs --packet "<runDir>" --launch
```

That command launches fresh `codex exec` child processes with no tracked-file write authority by default and writes their reports into the ignored packet directory. The researcher child gets live Codex web search by default for real GitHub/prior-art checks; use `--no-search` only for an intentionally offline provisional pass. If a packet is generated with `--research off`, the skip reason is recorded and the researcher child does not launch by default. Builder children require explicit role selection plus `--allow-write` after the planner has produced a disjoint write scope. Full verifier children also require explicit role selection plus `--allow-write`, because release gates can write generated build and test artifacts. Child prompts may use real `multi_agent_v1.spawn_agent` sidecars only when `terminal-agents.json` grants child-spawn permission. This is Codex-as-builder orchestration only; the Cognopticon browser app and daemon still do not dispatch hidden worker agents.
