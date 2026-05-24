import type { CognopticonWorkspace, ProjectDossier } from "../types/cognopticon";

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
