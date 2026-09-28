# Agency Kernel

The deterministic agency loop is:

```text
events -> beliefs -> goals -> proposals -> missions -> actions -> outcomes -> updated beliefs
```

The current implementation is deterministic-first and testable. It does not call an external LLM.

Proposals are ranked by impact, urgency, confidence, and effort, with at most 12 retained. As active projects become overdue, recovery proposals can outrank verification suggestions; those verification gaps remain represented in beliefs. Selection does not reserve a quota for each proposal kind.

Default goals:

- prepare public proof-of-work release
- identify agent-ready projects
- detect duplicate variants
- surface dormant high-substance work
- generate bounded missions
- improve Cognopticon itself

The action bus enforces policy before any capability is invoked.
