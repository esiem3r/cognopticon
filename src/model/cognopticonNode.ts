import type { Evidence, ProjectAnalysis, ProjectRelationship } from "../types/cognopticon";

export type NodeKind = "repo" | "tool" | "research" | "writing" | "dataset" | "agent_harness" | "service" | "archive" | "workspace";
export type NodeStatus = "active" | "forming" | "legacy" | "paused" | "archive" | "complete";
export type NodeHealth = "strong" | "promising" | "fragile" | "stalled" | "unknown";
export type NodeDecision = "build" | "triage" | "merge" | "pause" | "archive" | "launch";

export interface CognopticonNode {
  id: string;
  name: string;
  kind: NodeKind;
  path: string;
  state: NodeState;
  visual: NodeVisualSpec;
  facets: NodeFacet[];
  actions: NodeAction[];
  launch?: LaunchSpec;
  evidence: Evidence[];
  relationships: ProjectRelationship[];
  source: NodeSource;
}

export interface NodeState {
  status: NodeStatus;
  health: NodeHealth;
  decision: NodeDecision;
  activity: number;
  substance: number;
  maturity: number;
  confidence: number;
  staleness: number;
  readiness: number;
  lastTouched?: string;
  nextReview?: string;
}

export interface NodeVisualSpec {
  radius: number;
  brightness: number;
  pulse: number;
  confidenceHalo: number;
  anomalyIntensity: number;
  readinessRing: number;
  glyph: string;
  accent: "cyan" | "violet" | "amber" | "magenta" | "red" | "phosphor" | "muted";
}

export type NodeFacetKind =
  | "summary"
  | "metrics"
  | "evidence"
  | "relationships"
  | "mission"
  | "runtime"
  | "build_health"
  | "research_claims"
  | "writing_structure"
  | "dataset_index"
  | "agent_sessions"
  | "anomalies"
  | "lineage"
  | "attractors"
  | "affordances"
  | "goals"
  | "custom";

export interface NodeFacet<T = unknown> {
  id: string;
  title: string;
  kind: NodeFacetKind;
  priority: number;
  renderer: string;
  summary?: string;
  data: T;
}

export type NodeActionKind =
  | "open_url"
  | "open_path"
  | "open_editor"
  | "open_terminal"
  | "run_command"
  | "start_service"
  | "generate_mission"
  | "copy_prompt"
  | "focus_graph";

export interface NodeAction<T = unknown> {
  id: string;
  label: string;
  kind: NodeActionKind;
  primary?: boolean;
  danger?: boolean;
  requiresConfirmation?: boolean;
  disabledReason?: string;
  spec: T;
}

export interface LaunchSpec {
  label: string;
  mode: "url" | "local_process" | "dev_server" | "desktop_app" | "document" | "notebook";
  readiness: number;
  entrypoint?: string;
  healthcheck?: string;
  commands?: LaunchCommand[];
}

export interface LaunchCommand {
  id: string;
  label: string;
  cwd: string;
  command: string;
  args: string[];
  allowlistKey: string;
}

export interface NodeSource {
  dossierId?: string;
  scanner: "static" | "scan" | "heuristic" | "agent" | "manual" | "demo";
  confidence: number;
  analysis?: ProjectAnalysis;
}
