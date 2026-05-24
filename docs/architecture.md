# Architecture

Cognopticon is a local-first cognitive operations console. Its core architecture is deliberately split between deterministic browser-side intelligence and a narrow localhost daemon.

```text
Workspace input
  -> legacy ProjectDossier
  -> canonical CognopticonNode
  -> field model
  -> intelligence layer
  -> agency kernel
  -> graph-native UI
  -> mission/action layer
  -> daemon session, job, or manual handoff
  -> events and updated beliefs
```

`ProjectDossier` is scan/demo input. `CognopticonNode` is the canonical UI and intelligence object. Nodes carry state, readiness, confidence, facets, launch specs, actions, evidence, relationships, and source metadata.

The field model derives signals, state vectors, lineages, attractors, attention regions, and affordances. The intelligence layer derives beliefs, proposals, missions, and self diagnostics. The agency kernel runs the deterministic loop that turns project state into an attention queue.

The graph is the primary surface. Side detail exists as overflow, not as the product center.

Runtime boundaries:

- The browser can always inspect, focus, propose, and generate bounded mission packets.
- The daemon serves private workspace state, records runtime events, opens allowed paths, opens the configured editor, and runs policy-approved commands.
- The orchestrator endpoint arms a user-facing session and records task events. It does not create unrestricted worker agents.
- Agent adapters are typed integration points. The shipped reliable adapter is manual copy, so unavailable integrations do not fake dispatch.
