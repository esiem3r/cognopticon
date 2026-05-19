# Cosmopticon

Cosmopticon is a local spatial observatory for projects, relationships, and agent mission briefs.

It is designed for a workspace where the hard problem is not idea generation. The hard problem is keeping work visible, bounded, beautiful enough to return to, and constrained enough that agents can finish without drifting.

## Commands

```bash
npm install
npm run dev
npm run build
npm test
npm run test:e2e
npm run validate:data
npm run scan
```

Open the app at `http://127.0.0.1:5173/` after starting the dev server.

## Data

- `src/data/projects.json` is the canonical v1 project universe.
- `src/data/relationships.json` defines explicit project relationships.
- `scripts/scan-workspace.mjs` discovers project candidates, but scan results are evidence, not truth.
- `npm run validate:data` checks duplicate IDs, missing required fields, invalid decisions, and broken relationship endpoints.

Each dossier records a project decision:

- `build`: keep actively building
- `triage`: inspect and classify before investing more
- `merge`: consolidate variants or fold into another project
- `pause`: hold intentionally
- `archive`: preserve as reference, not active work

Use `nextReview` as the date the project should be looked at again.

## Mission Briefs

Select a project and generate a mission brief to create a constrained handoff for Codex, Claude Code, or another agent. The brief includes context, allowed working area, constraints, related projects, acceptance criteria, and first actions.

The mission drawer supports copying the brief or downloading it as Markdown. Downloaded briefs are intentionally ignored under `missions/` by default so private local packets do not accidentally become part of the repo.

## Daily Use

1. Start Cosmopticon with `npm run dev`.
2. Pick a focus mode: active work, triage, agent harnesses, research, or memory/corpus.
3. Use the next action queue to choose the next project.
4. Open the dossier and read the decision, friction, next move, and constraints.
5. Generate a mission brief before starting an agent session.
6. After the work, update the dossier decision, next move, and review date.

## Adding Projects

1. Run `npm run scan` to find candidates.
2. Add a human-shaped dossier to `src/data/projects.json`.
3. Add meaningful relationships in `src/data/relationships.json`.
4. Run `npm run validate:data`, `npm test`, and `npm run build`.
