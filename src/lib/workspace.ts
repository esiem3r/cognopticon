import metadata from "../data/workspace-meta.json";
import projects from "../data/projects.json";
import relationships from "../data/relationships.json";
import roots from "../data/workspace-roots.json";
import type { CognopticonWorkspace, ProjectDossier } from "../types/cognopticon";

export const sampleWorkspace = {
  ...metadata,
  roots,
  projects,
  relationships
} as CognopticonWorkspace;

export async function loadWorkspace(fetcher: typeof fetch = fetch): Promise<CognopticonWorkspace> {
  try {
    const daemonResponse = await fetcher("/api/workspace", { cache: "no-store" });
    if (daemonResponse.ok) {
      const workspace = await daemonResponse.json() as CognopticonWorkspace;
      if (Array.isArray(workspace.projects) && Array.isArray(workspace.relationships)) return ensureWorkspaceCore(workspace);
    }
  } catch {
    // Vite/static mode does not expose the daemon API.
  }
  return ensureWorkspaceCore(sampleWorkspace);
}

export function ensureWorkspaceCore(workspace: CognopticonWorkspace): CognopticonWorkspace {
  if (workspace.projects.some((project) => project.id === "cognopticon" || project.id === "workspace-core")) return workspace;
  const generatedCore: ProjectDossier = {
    id: "workspace-core",
    name: workspace.title || "Workspace Core",
    path: workspace.roots[0] ?? "/",
    status: "active",
    health: "promising",
    domain: "operations",
    activity: 1,
    substance: 1,
    position: { x: 0, y: 0 },
    purpose: "Central reference point for the generated local project universe.",
    whyItMatters: "It gives the graph a stable observer-centered origin without pretending the workspace itself is a project.",
    currentFriction: workspace.analysis?.summary ?? "Awaiting agent enrichment.",
    nextMove: "Scan, analyze, and enrich the local workspace.",
    decision: "build",
    decisionRationale: "The cockpit is the organizing layer for the surrounding projects.",
    nextReview: new Date().toISOString().slice(0, 10),
    missionConstraints: ["Use this as navigation context; do not edit arbitrary projects from the core node."],
    evidence: workspace.roots.map((root) => ({ label: "Workspace root", path: root, kind: "repo" })),
    tags: ["workspace", "orchestration", "cockpit"],
    analysis: {
      source: "heuristic",
      confidence: 1,
      layoutReasons: [{ label: "origin", detail: "Synthetic center node generated for navigation.", weight: 1 }]
    }
  };
  return {
    ...workspace,
    projects: [generatedCore, ...workspace.projects]
  };
}
