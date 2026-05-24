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
- `handoff.md`: bounded prompt for a second Codex terminal.
- `final-report.md`: human review packet.

Generate a packet with:

```bash
npm run lifecycle:packet -- --objective "Describe the next bounded Cognopticon objective"
```

The packet is private local state under `.cognopticon/profiles/<profile>/loops/<run>/`.

Run `npm run validate:lifecycle` to prove the packet still includes the structured research brief, bounded handoff, and release-gate evidence trail. Run `npm run validate:lifecycle -- --packet "<runDir>" --complete-research` to prove the research brief has been filled before the planner locks direction.
