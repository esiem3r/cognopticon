export type ProjectStatus = "active" | "forming" | "legacy" | "paused" | "archive";
export type ProjectHealth = "strong" | "promising" | "fragile" | "stalled" | "unknown";
export type ProjectDecision = "build" | "triage" | "merge" | "pause" | "archive";
export type ProjectKind = "project" | "dependency" | "tooling" | "template" | "archive" | "duplicate" | "parent" | "unknown";
export type ProjectVisibility = "default" | "hidden" | "needs_review";
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

export interface AnalysisEvidence {
  label: string;
  detail: string;
  weight?: number;
}

export interface ProjectAnalysis {
  source: "static" | "scan" | "heuristic" | "agent" | "manual" | "demo";
  confidence: number;
  languages?: string[];
  frameworks?: string[];
  signals?: string[];
  projectKind?: ProjectKind;
  visibility?: ProjectVisibility;
  relationshipReasons?: AnalysisEvidence[];
  layoutReasons?: AnalysisEvidence[];
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
  analysis?: ProjectAnalysis;
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
  sourceKind?: "static" | "heuristic" | "agent" | "manual" | "demo";
  evidence?: AnalysisEvidence[];
}

export interface MissionBrief {
  projectId: string;
  markdown: string;
  generatedAt: string;
}

export interface RunRecord {
  id: string;
  projectId: string;
  title: string;
  status: "draft" | "awaiting_approval" | "reviewed" | "approved" | "dispatched" | "running" | "completed" | "failed" | "blocked";
  summary: string;
  command?: string;
  jobId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CognopticonWorkspace {
  generatedAt: string;
  title: string;
  profile?: {
    id: string;
    label?: string;
    deviceId?: string;
    stateDir?: string;
  };
  roots: string[];
  projects: ProjectDossier[];
  relationships: ProjectRelationship[];
  analysis?: {
    source: "sample" | "generated" | "hybrid";
    summary: string;
    pendingEnrichment?: number;
  };
  review?: {
    hiddenCandidates: number;
    needsReview: number;
    sourceReviewPath: string;
  };
}

export interface WorkspaceScanResult {
  generatedAt: string;
  profile?: {
    id: string;
    label?: string;
    deviceId?: string;
    stateDir?: string;
  };
  roots: string[];
  candidates: Array<{
    name: string;
    path: string;
    relativePath?: string;
    signals: string[];
    packageName?: string;
    projectKind?: ProjectKind;
    visibility?: ProjectVisibility;
    duplicateOf?: string;
    classificationReasons?: string[];
  }>;
  review?: WorkspaceScanResult["candidates"];
}
