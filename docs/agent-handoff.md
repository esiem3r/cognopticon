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

The Markdown document is the human-readable artifact. The fenced JSON block immediately under `## Handoff Packet` is the machine contract. Adapter entrypoints must parse and validate that block before handing the mission to another tool; missing, duplicated, malformed, unsupported, or authority-unsafe packets fail closed.

Daemon-backed orchestration adds an audit trail around the human session: the daemon can start an orchestrator session, record task completion or reopening, and stream those events back into the rail. That is not the same thing as granting an agent broad workspace authority. The packet remains the authority boundary.

Generated packets do not grant edit authority. `authority.mayEdit` remains empty until an adapter implements explicit approval handling, `authority.requiresApproval` must include file edits, and runnable verification commands are restricted to Cognopticon's known read-only gate commands.

Good handoff rule: the agent receives a mission, not a vague instruction.

Good return rule: the agent reports changed files, verification commands, unresolved risks, and any authority it did not use.
