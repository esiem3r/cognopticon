# Agent Handoff

Cognopticon sits before a coding agent. It converts messy project state into bounded mission packets.

A mission contains:

- objective
- context packet
- relevant files
- excluded files
- constraints
- acceptance criteria
- verification commands
- authority boundaries

The default adapter is manual copy. Typed seams exist for Codex CLI, OpenAI Agents, Claude Code, and local scripts, but unavailable adapters do not fake dispatch.

Daemon-backed orchestration adds an audit trail around the human session: the daemon can start an orchestrator session, record task completion or reopening, and stream those events back into the rail. That is not the same thing as granting an agent broad workspace authority. The packet remains the authority boundary.

Good handoff rule: the agent receives a mission, not a vague instruction.

Good return rule: the agent reports changed files, verification commands, unresolved risks, and any authority it did not use.
