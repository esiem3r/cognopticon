export interface EvidenceRef {
  kind: "file" | "metric" | "relationship" | "event" | "test" | "user_note" | "scan";
  label: string;
  path?: string;
  value?: unknown;
  confidence?: number;
}

export interface ProjectSignal {
  id: string;
  nodeId: string;
  kind: "file_present" | "file_missing" | "recent_change" | "stale_timestamp" | "test_surface" | "build_surface" | "readme_surface" | "duplicate_name" | "shared_terms" | "git_activity" | "mission_generated" | "agent_output" | "user_touch" | "public_hygiene_risk";
  strength: number;
  confidence: number;
  evidence: EvidenceRef[];
  observedAt: string;
}

export interface ProjectStateVector {
  nodeId: string;
  substance: number;
  maturity: number;
  verificationDepth: number;
  documentationDepth: number;
  runtimeClarity: number;
  traction: number;
  staleness: number;
  friction: number;
  contextLoad: number;
  closurePressure: number;
  noveltyPull: number;
  dependencyGravity: number;
  relationshipDensity: number;
  lineageAmbiguity: number;
  duplicatePressure: number;
  isolation: number;
  agentSuitability: number;
  missionClarity: number;
  authorityRisk: number;
  blastRadius: number;
  demoWorthiness: number;
  publicHygieneRisk: number;
  narrativeStrength: number;
  entropy: number;
  confidence: number;
  updatedAt: string;
}

export type AttractorKind = "duplicate_restart_loop" | "context_swamp" | "high_concept_low_closure" | "haunted_repo" | "sleeping_giant" | "launchable_tool" | "proof_forge" | "archive_fossil" | "agent_trap" | "public_release_blocker" | "demo_anchor" | "integration_spine" | "overgrown_scope" | "verification_gap" | "lineage_split";
export type TransformationKind = "stabilize" | "merge_lineage" | "extract_core" | "public_release_harden" | "generate_agent_mission" | "archive_with_summary" | "revive" | "verify" | "instrument" | "document" | "launch" | "self_improve";

export interface Attractor {
  id: string;
  kind: AttractorKind;
  nodeIds: string[];
  intensity: number;
  confidence: number;
  stability: number;
  signature: string[];
  evidence: EvidenceRef[];
  preferredTransformations: TransformationKind[];
}

export interface ProjectLineage {
  id: string;
  canonicalName: string;
  nodeIds: string[];
  rootNodeId?: string;
  activeBranchId?: string;
  branches: Array<{ id: string; nodeId: string; role: "origin" | "fork" | "backup" | "rewrite" | "experiment" | "archive" | "canonical" | "unknown"; divergenceReason?: string; confidence: number }>;
  recommendedCanonicalNodeId?: string;
  mergePressure: number;
  ambiguity: number;
}

export interface AttentionRegion {
  id: string;
  nodeIds: string[];
  reason: "urgent_blocker" | "high_leverage" | "lineage_anomaly" | "agent_ready" | "demo_relevant" | "self_diagnostic" | "decay_risk";
  salience: number;
  confidence: number;
  suggestedMode: "survey" | "triage" | "build" | "merge" | "archive" | "demo" | "agent";
}

export interface Affordance {
  id: string;
  nodeIds: string[];
  kind: TransformationKind;
  label: string;
  description: string;
  enabled: boolean;
  readiness: number;
  risk: number;
  expectedStateChange: Partial<ProjectStateVector>;
  requiredConditions: string[];
  blockedBy: string[];
  visualEncoding: { portKind: "dock" | "forge" | "merge" | "archive" | "launch" | "inspect"; accent: "cyan" | "amber" | "violet" | "magenta" | "red"; intensity: number };
}

export interface FieldModel {
  signals: ProjectSignal[];
  vectors: ProjectStateVector[];
  lineages: ProjectLineage[];
  attractors: Attractor[];
  attention: AttentionRegion[];
  affordances: Affordance[];
}
