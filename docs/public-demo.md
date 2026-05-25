# Public Demo

For a first checkout, start with `docs/getting-started.md` and choose public demo mode unless you deliberately want local workspace access.

The public demo uses the sanitized split fixtures in `src/data/workspace-meta.json`, `src/data/projects.json`, `src/data/relationships.json`, and `src/data/workspace-roots.json`.

Run the local public demo with:

```bash
npm run dev:demo
```

That local demo mode uses the same static public adapters as the Pages build, so it does not probe the local daemon or private workspace API.

The hosted public demo is built for GitHub Pages with:

```bash
npm run build:pages
npm run validate:pages
```

That build writes `dist-pages/` with the `/cognopticon/` base path and is deployed only by the `Public Demo Pages` workflow after the full `npm run check` release gate passes. The Pages build swaps in static public-demo adapters, so the hosted artifact must not publish generated workspace JSON, `.cognopticon/` state, private paths, daemon secrets, local runtime API calls, or localhost daemon probes.

It intentionally includes operational patterns:

- self-node
- launchable tool
- research verification gap
- writing/narrative node
- corpus/privacy node
- duplicate variant cluster
- sleeping giant
- archive fossil
- public-release blocker

No private local paths should appear in demo data.
