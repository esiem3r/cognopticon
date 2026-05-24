import type {
  MissionBrief,
  ProjectDossier,
  ProjectDecision,
  ProjectDomain,
  ProjectHealth,
  ProjectRelationship,
  ProjectStatus
} from "../types/cognopticon";
import { defaultExcludedFiles, renderMissionPacketMarkdown, verificationCommandsFromSignals } from "./missionPacket";

export const domainLabels: Record<ProjectDomain, string> = {
  agentics: "Agentics",
  memory: "Memory",
  research: "Research",
  visualization: "Visualization",
  corpus: "Corpus",
  operations: "Operations",
  infrastructure: "Infrastructure",
  writing: "Writing"
};

export const domainColors: Record<ProjectDomain, string> = {
  agentics: "#ffb86b",
  memory: "#81d4ff",
  research: "#b7f27a",
  visualization: "#f98ad4",
  corpus: "#d5c6ff",
  operations: "#ffd166",
  infrastructure: "#80e4c9",
  writing: "#f4efc7"
};

export const statusLabels: Record<ProjectStatus, string> = {
  active: "Active",
  forming: "Forming",
  legacy: "Legacy",
  paused: "Paused",
  archive: "Archive"
};

export const healthLabels: Record<ProjectHealth, string> = {
  strong: "Strong",
  promising: "Promising",
  fragile: "Fragile",
  stalled: "Stalled",
  unknown: "Unknown"
};

export const decisionLabels: Record<ProjectDecision, string> = {
  build: "Build",
  triage: "Triage",
  merge: "Merge",
  pause: "Pause",
  archive: "Archive"
};

export const focusModes = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "triage", label: "Needs Triage" },
  { id: "agentics", label: "Agent Harnesses" },
  { id: "research", label: "Research" },
  { id: "memory", label: "Memory / Corpus" }
] as const;

export type FocusMode = (typeof focusModes)[number]["id"];

export function relatedProjects(
  projectId: string,
  projects: ProjectDossier[],
  relationships: ProjectRelationship[]
) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  return relationships
    .filter((relationship) => relationship.source === projectId || relationship.target === projectId)
    .map((relationship) => {
      const otherId = relationship.source === projectId ? relationship.target : relationship.source;
      return { relationship, project: byId.get(otherId) };
    })
    .filter((item): item is { relationship: ProjectRelationship; project: ProjectDossier } => Boolean(item.project));
}

export function scoreProject(project: ProjectDossier) {
  return project.activity * 0.45 + project.substance * 0.45 + (project.status === "active" ? 0.1 : 0);
}

export function generateMissionBrief(
  project: ProjectDossier,
  projects: ProjectDossier[],
  relationships: ProjectRelationship[],
  generatedAt = new Date().toISOString()
): MissionBrief {
  const related = relatedProjects(project.id, projects, relationships);
  const relevantFiles = [project.path, ...project.evidence.map((item) => item.path)];
  const signals = project.analysis?.signals ?? project.evidence.map((item) => item.label);
  const verificationCommands = verificationCommandsFromSignals(signals, project.evidence.map((item) => item.path));
  const markdown = renderMissionPacketMarkdown({
    id: `mission:${project.id}:${generatedAt}`,
    source: "project",
    projectIds: [project.id],
    title: `Mission Brief: ${project.name}`,
    objective: project.nextMove,
    generatedAt,
    contextSummary: project.purpose,
    currentState: `${decisionLabels[project.decision]}: ${project.decisionRationale}`,
    relevantFiles,
    excludedFiles: defaultExcludedFiles(),
    knownRisks: [project.currentFriction, ...(project.analysis?.layoutReasons?.map((item) => item.detail) ?? [])],
    constraints: project.missionConstraints,
    acceptanceCriteria: [
      "The agent states the intended change before editing.",
      "The agent keeps work scoped to the allowed working area unless explicitly redirected.",
      "The agent produces a concrete verification result or clearly explains why verification could not run.",
      "The final handoff names changed files, remaining risks, and the next smallest useful move."
    ],
    firstActions: [
      "Inspect the project root and current git state.",
      "Read the nearest README, project config, and existing tests.",
      "Identify the smallest change that directly advances the goal.",
      "Stop and ask only if the goal conflicts with local evidence."
    ],
    verificationCommands,
    authority: {
      mayRead: relevantFiles,
      mayEdit: [],
      mayRun: verificationCommands,
      requiresApproval: ["file edits", "commands beyond listed verification", "network access", "git commits or pushes"]
    },
    sections: [
      { heading: "Why It Matters", body: project.whyItMatters },
      { heading: "Current Friction", body: project.currentFriction },
      { heading: "Project Decision", body: `${decisionLabels[project.decision]}: ${project.decisionRationale}` },
      { heading: "Next Review", body: project.nextReview },
      {
        heading: "Related Projects",
        body: related.length
          ? related.map((item) => `- ${item.project.name}: ${item.relationship.label}`)
          : ["- None recorded yet."]
      }
    ]
  });

  return { projectId: project.id, markdown, generatedAt };
}

export function focusModeMatches(project: ProjectDossier, focusMode: FocusMode) {
  if (focusMode === "all") return true;
  if (focusMode === "active") return project.status === "active" || project.decision === "build";
  if (focusMode === "triage") return project.decision === "triage" || project.health === "fragile" || project.health === "unknown";
  if (focusMode === "agentics") return project.domain === "agentics" || project.tags.some((tag) => tag.includes("agent") || tag.includes("harness"));
  if (focusMode === "research") return project.domain === "research";
  if (focusMode === "memory") return project.domain === "memory" || project.domain === "corpus";
  return true;
}

export function nextActionQueue(projects: ProjectDossier[]) {
  const weights: Record<ProjectDecision, number> = {
    build: 0,
    triage: 1,
    merge: 2,
    pause: 3,
    archive: 4
  };
  return [...projects].sort((a, b) => {
    const decisionDelta = weights[a.decision] - weights[b.decision];
    if (decisionDelta) return decisionDelta;
    const dateDelta = Date.parse(a.nextReview) - Date.parse(b.nextReview);
    if (Number.isFinite(dateDelta) && dateDelta) return dateDelta;
    return b.activity + b.substance - (a.activity + a.substance);
  });
}

export function projectMatches(project: ProjectDossier, query: string) {
  const text = [
    project.name,
    project.path,
    project.domain,
    project.status,
    project.health,
    project.purpose,
    project.whyItMatters,
    project.currentFriction,
    project.nextMove,
    project.tags.join(" ")
  ]
    .join(" ")
    .toLowerCase();
  return text.includes(query.trim().toLowerCase());
}
