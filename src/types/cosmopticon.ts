export type ProjectStatus = "active" | "forming" | "legacy" | "paused" | "archive";
export type ProjectHealth = "strong" | "promising" | "fragile" | "stalled" | "unknown";
export type ProjectDecision = "build" | "triage" | "merge" | "pause" | "archive";
export type ProjectDomain =
  | "agentics"
  | "memory"
  | "research"
  | "visualization"
  | "corpus"
  | "operations"
  | "infrastructure"
  | "writing";

export interface Evidence {
  label: string;
  path: string;
  kind: "repo" | "file" | "service" | "dataset" | "note";
}

export interface ProjectDossier {
  id: string;
  name: string;
  path: string;
  status: ProjectStatus;
  health: ProjectHealth;
  domain: ProjectDomain;
  activity: number;
  substance: number;
  position: { x: number; y: number };
  purpose: string;
  whyItMatters: string;
  currentFriction: string;
  nextMove: string;
  decision: ProjectDecision;
  decisionRationale: string;
  nextReview: string;
  missionHistory?: Array<{
    generatedAt: string;
    title: string;
    outcome?: string;
  }>;
  missionConstraints: string[];
  evidence: Evidence[];
  tags: string[];
}

export type RelationshipKind =
  | "feeds"
  | "depends_on"
  | "inspired_by"
  | "supersedes"
  | "archive_source"
  | "agent_target"
  | "reference";

export interface ProjectRelationship {
  id: string;
  source: string;
  target: string;
  kind: RelationshipKind;
  label: string;
  strength: number;
}

export interface MissionBrief {
  projectId: string;
  markdown: string;
  generatedAt: string;
}

export interface WorkspaceScanResult {
  generatedAt: string;
  roots: string[];
  candidates: Array<{
    name: string;
    path: string;
    signals: string[];
    packageName?: string;
  }>;
}
