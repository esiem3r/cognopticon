import type { AttentionRegion, EvidenceRef } from "../field/types";
import type { Belief, CognopticonEvent, CompiledMission, InterventionProposal } from "../intelligence/types";
import type { CognopticonNode } from "../model/cognopticonNode";
import type { ProjectRelationship } from "../types/cognopticon";

export type CognopticonGoalKind = "prepare_public_release" | "stabilize_project" | "identify_agent_ready_work" | "reduce_context_bloat" | "merge_duplicate_variants" | "archive_dead_weight" | "improve_self" | "generate_mission" | "verify_build";

export interface CognopticonGoal {
  id: string;
  kind: CognopticonGoalKind;
  title: string;
  description: string;
  priority: number;
  status: "active" | "satisfied" | "paused" | "abandoned";
  nodeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type AutonomyLevel = "observe_only" | "propose_only" | "prepare_missions" | "execute_readonly" | "execute_registered_actions" | "delegate_to_agents" | "self_improve_with_approval";

export interface AutonomyPolicy {
  autonomyLevel: AutonomyLevel;
  allowedRoots: string[];
  allowedCommands: string[];
  autoGenerateMissions: boolean;
  autoRunReadOnlyChecks: boolean;
  autoLaunchRegisteredTools: boolean;
  autoDelegateToAgents: boolean;
  requireApprovalFor: Array<"file_edits" | "file_deletes" | "git_commit" | "git_push" | "external_network" | "agent_delegation" | "long_running_process">;
  maxDailyAgentRuns?: number;
  agentBudget?: AgentBudget;
}

export interface AgentBudget {
  maxRootAgents: number;
  maxThreads: number;
  maxDepth: number;
  maxChildrenPerAgent: number;
  maxTotalAgents: number;
  maxRuntimeMs: number;
  maxRetries: number;
}

export type AgentTaskStatus = "queued" | "admitted" | "blocked" | "running" | "completed" | "failed" | "cancelled";

export interface AgentTask {
  id: string;
  parentTaskId?: string;
  missionId: string;
  nodeIds: string[];
  depth: number;
  status: AgentTaskStatus;
  assignedPaths: string[];
  prompt: string;
  acceptanceCriteria: string[];
  verificationCommands: string[];
  createdAt: string;
  updatedAt: string;
  blockedReason?: string;
}

export interface AgentRun {
  id: string;
  taskId: string;
  status: AgentTaskStatus;
  daemonJobId?: string;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
  artifacts?: string[];
  error?: string;
}

export interface DaemonStatus {
  online: boolean;
  url: string;
  checkedAt: string;
  error?: string;
}

export interface AgencyTickInput {
  workspaceId: string;
  nodes: CognopticonNode[];
  relationships: ProjectRelationship[];
  events: CognopticonEvent[];
  goals: CognopticonGoal[];
  policy: AutonomyPolicy;
  daemonStatus?: DaemonStatus;
}

export interface NodeStatePatch {
  nodeId: string;
  readiness?: number;
  confidence?: number;
  staleness?: number;
  annotations?: string[];
}

export interface AttentionItem {
  id: string;
  kind: "proposal" | "mission" | "anomaly" | "goal" | "self_diagnostic" | "daemon_status" | "verification_result";
  title: string;
  summary: string;
  severity: "info" | "notice" | "warning" | "critical";
  priority: number;
  nodeIds: string[];
  proposalId?: string;
  missionId?: string;
  eventIds: string[];
  createdAt: string;
}

export interface AgencyTickResult {
  events: CognopticonEvent[];
  beliefs: Belief[];
  proposals: InterventionProposal[];
  missions: CompiledMission[];
  updatedGoals: CognopticonGoal[];
  nodePatches: NodeStatePatch[];
  attentionQueue: AttentionItem[];
  fieldAttention: AttentionRegion[];
}

export interface Capability {
  id: string;
  label: string;
  kind: "focus_graph" | "copy_to_clipboard" | "generate_mission" | "open_path" | "open_editor" | "run_readonly_command" | "start_registered_service" | "delegate_to_agent";
  available: boolean;
  requiresDaemon: boolean;
  requiresApproval: boolean;
  description: string;
}

export interface ActionInvocation {
  id: string;
  capabilityId: string;
  nodeIds: string[];
  missionId?: string;
  proposalId?: string;
  payload: unknown;
  requestedAt: string;
  requestedBy: "user" | "agency_kernel";
}

export interface ActionOutcome {
  id: string;
  invocationId: string;
  ok: boolean;
  summary: string;
  evidence: EvidenceRef[];
  events: CognopticonEvent[];
  completedAt: string;
}

export type MissionStatus = "proposed" | "compiled" | "awaiting_approval" | "approved" | "dispatched" | "running" | "completed" | "failed" | "stale" | "superseded" | "rejected";

export interface MissionState {
  missionId: string;
  status: MissionStatus;
  nodeIds: string[];
  proposalId?: string;
  createdAt: string;
  updatedAt: string;
  dispatchedAt?: string;
  completedAt?: string;
  outcomeSummary?: string;
  verificationEvidence: EvidenceRef[];
}
