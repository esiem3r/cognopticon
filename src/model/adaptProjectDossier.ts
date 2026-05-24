import type { ProjectDossier, ProjectRelationship } from "../types/cognopticon";
import { computeReadiness } from "./readiness";
import type { CognopticonNode, NodeDecision, NodeHealth, NodeKind, NodeStatus } from "./cognopticonNode";

export function adaptProjectDossier(project: ProjectDossier, relationships: ProjectRelationship[]): CognopticonNode {
  const localRelationships = relationships.filter((relationship) => relationship.source === project.id || relationship.target === project.id);
  const anomalyIntensity = scoreAnomalyIntensity(project);
  const node: CognopticonNode = {
    id: project.id,
    name: project.name,
    kind: inferNodeKind(project),
    path: project.path,
    state: {
      status: project.status as NodeStatus,
      health: project.health as NodeHealth,
      decision: project.decision as NodeDecision,
      activity: project.activity,
      substance: project.substance,
      maturity: scoreMaturity(project),
      confidence: project.analysis?.confidence ?? 0.55,
      staleness: scoreStaleness(project.nextReview, project.activity),
      readiness: 0,
      nextReview: project.nextReview
    },
    visual: {
      radius: 12 + project.substance * 18,
      brightness: 0.35 + project.activity * 0.55,
      pulse: project.status === "active" ? 0.8 : 0.24,
      confidenceHalo: project.analysis?.confidence ?? 0.55,
      anomalyIntensity,
      readinessRing: 0,
      glyph: glyphFor(project),
      accent: accentFor(project)
    },
    facets: [
      { id: `${project.id}:summary`, title: "Summary", kind: "summary", priority: 100, renderer: "summary", summary: project.purpose, data: { purpose: project.purpose, whyItMatters: project.whyItMatters, friction: project.currentFriction } },
      { id: `${project.id}:metrics`, title: "State Vector", kind: "metrics", priority: 90, renderer: "metrics", data: { activity: project.activity, substance: project.substance, health: project.health, decision: project.decision } },
      { id: `${project.id}:evidence`, title: "Evidence", kind: "evidence", priority: 80, renderer: "evidence", data: project.evidence },
      { id: `${project.id}:mission`, title: "Mission", kind: "mission", priority: 70, renderer: "mission", summary: project.nextMove, data: { nextMove: project.nextMove, constraints: project.missionConstraints } }
    ],
    actions: [
      { id: `${project.id}:focus`, label: "Focus Graph", kind: "focus_graph", primary: true, spec: { nodeId: project.id } },
      { id: `${project.id}:mission`, label: "Generate Mission", kind: "generate_mission", primary: true, spec: { nodeId: project.id } },
      { id: `${project.id}:copy-path`, label: "Copy Path", kind: "open_path", spec: { path: project.path, fallback: "copy" } }
    ],
    launch: inferLaunch(project),
    evidence: project.evidence,
    relationships: localRelationships,
    source: {
      dossierId: project.id,
      scanner: project.analysis?.source ?? "static",
      confidence: project.analysis?.confidence ?? 0.55,
      analysis: project.analysis
    }
  };
  const readiness = computeReadiness(node);
  return {
    ...node,
    state: { ...node.state, readiness: readiness.score },
    visual: { ...node.visual, readinessRing: readiness.score / 100 }
  };
}

export function adaptProjectDossiers(projects: ProjectDossier[], relationships: ProjectRelationship[]) {
  return projects.map((project) => adaptProjectDossier(project, relationships));
}

function inferNodeKind(project: ProjectDossier): NodeKind {
  if (project.id === "workspace-core" || project.id === "cognopticon") return "workspace";
  if (project.status === "archive" || project.decision === "archive") return "archive";
  if (project.domain === "research") return "research";
  if (project.domain === "writing") return "writing";
  if (project.domain === "corpus" || project.domain === "memory") return "dataset";
  if (project.domain === "agentics") return "agent_harness";
  if (project.tags.some((tag) => tag.includes("launch") || tag.includes("tool"))) return "tool";
  if (project.tags.some((tag) => tag.includes("service"))) return "service";
  return "repo";
}

function scoreMaturity(project: ProjectDossier) {
  const evidenceScore = Math.min(project.evidence.length / 5, 1);
  return clamp(project.substance * 0.42 + project.activity * 0.22 + evidenceScore * 0.22 + (project.health === "strong" ? 0.14 : 0), 0, 1);
}

function scoreStaleness(nextReview: string, activity: number) {
  const daysPast = Math.max(0, (Date.now() - Date.parse(nextReview)) / 86_400_000);
  return clamp(daysPast / 30 + (1 - activity) * 0.35, 0, 1);
}

function inferLaunch(project: ProjectDossier) {
  const signals = project.analysis?.signals ?? [];
  const launchTagged = project.tags.some((tag) => tag.includes("launch") || tag.includes("tool")) || signals.includes("launch");
  const packageBacked = signals.includes("package.json") && signals.includes("tests");
  if (!launchTagged && !packageBacked) return undefined;
  return {
    label: packageBacked ? `Verify ${project.name}` : `Launch ${project.name}`,
    mode: packageBacked ? "local_process" as const : "dev_server" as const,
    readiness: packageBacked ? 0.86 : 0.74,
    commands: [{
      id: `${project.id}:npm-test`,
      label: "Run verification",
      cwd: project.path,
      command: "npm",
      args: ["test"],
      allowlistKey: "npm:test"
    }]
  };
}

function scoreAnomalyIntensity(project: ProjectDossier) {
  let score = 0;
  if (project.health === "fragile") score += 0.45;
  if (project.health === "stalled" || project.health === "unknown") score += 0.3;
  if (project.decision === "merge") score += 0.35;
  if (project.decision === "archive") score += 0.12;
  if (/\/home\/|\/mnt\/c\/Users|C:\\Users/.test(project.path)) score += 0.65;
  if (project.tags.some((tag) => /privacy|hygiene|blocker|duplicate|authority-risk|verification-gap/.test(tag))) score += 0.24;
  return clamp(score, 0, 1);
}

function glyphFor(project: ProjectDossier) {
  if (project.domain === "research") return "proof";
  if (project.domain === "agentics") return "agent";
  if (project.domain === "writing") return "text";
  if (project.domain === "corpus" || project.domain === "memory") return "index";
  return "node";
}

function accentFor(project: ProjectDossier) {
  if (project.health === "fragile") return "magenta";
  if (project.decision === "archive") return "muted";
  if (project.decision === "merge") return "violet";
  if (project.tags.some((tag) => tag.includes("launch"))) return "amber";
  if (project.status === "active") return "cyan";
  return "phosphor";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
