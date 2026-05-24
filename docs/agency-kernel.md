# Agency Kernel

The deterministic agency loop is:

```text
events -> beliefs -> goals -> proposals -> missions -> actions -> outcomes -> updated beliefs
```

The current implementation is deterministic-first and testable. It does not call an external LLM.

Default goals:

- prepare public proof-of-work release
- identify agent-ready projects
- detect duplicate variants
- surface dormant high-substance work
- generate bounded missions
- improve Cognopticon itself

The action bus enforces policy before any capability is invoked.
