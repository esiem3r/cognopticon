import type { EvidenceRef } from "../field/types";

export type BeliefPredicate = "is_agent_ready" | "is_launchable" | "is_duplicate_variant" | "is_stale_active" | "is_high_substance_dormant" | "has_public_hygiene_blocker" | "has_missing_verification" | "has_unclear_next_move" | "is_demo_worthy" | "should_be_merged" | "should_be_archived";

export interface CognopticonEvent {
  id: string;
  type: "workspace_scanned" | "node_created" | "node_updated" | "belief_created" | "belief_updated" | "proposal_created" | "proposal_accepted" | "mission_generated" | "mission_launched" | "agent_run_started" | "agent_run_completed" | "test_run_completed" | "user_dismissed" | "user_corrected" | "file_opened" | "command_executed" | "action_failed" | "orchestrator_session_started" | "orchestrator_task_completed" | "orchestrator_task_reopened" | "job_queued" | "job_started" | "job_output" | "job_timeout" | "job_finished";
  workspaceId: string;
  nodeId?: string;
  missionId?: string;
  payload: unknown;
  createdAt: string;
}

export interface Belief {
  id: string;
  subjectId: string;
  predicate: BeliefPredicate;
  value: boolean | number | string;
  confidence: number;
  evidence: EvidenceRef[];
  source: "scanner" | "heuristic" | "llm" | "user" | "agent_result" | "self_diagnostic";
  createdAt: string;
  updatedAt: string;
}

export interface ProposedAction {
  id: string;
  label: string;
  kind: "focus_graph" | "generate_mission" | "run_check" | "open_path" | "open_editor" | "launch_tool" | "delegate_agent" | "dismiss" | "snooze" | "copy_prompt";
  requiresApproval: boolean;
  capabilityId?: string;
  payload: unknown;
}

export interface InterventionProposal {
  id: string;
  title: string;
  summary: string;
  kind: "merge" | "archive" | "launch" | "stabilize" | "document" | "prepare_demo" | "generate_mission" | "run_check" | "self_improve" | "reduce_context_bloat";
  nodeIds: string[];
  beliefIds: string[];
  goalIds: string[];
  rationale: string;
  evidence: EvidenceRef[];
  impact: number;
  urgency: number;
  confidence: number;
  effort: number;
  reversibility: number;
  status: "new" | "accepted" | "dismissed" | "snoozed" | "converted_to_mission" | "executed" | "failed";
  actions: ProposedAction[];
  createdAt: string;
}

export interface CompiledMission {
  id: string;
  proposalId?: string;
  nodeIds: string[];
  title: string;
  objective: string;
  contextPacket: { canonicalSummary: string; relevantFiles: string[]; excludedFiles: string[]; knownRisks: string[]; currentState: string };
  constraints: string[];
  acceptanceCriteria: string[];
  verificationCommands: string[];
  agentInstructions: { role: string; style: string; forbiddenMoves: string[]; requiredOutputs: string[] };
  authority: { mayRead: string[]; mayEdit: string[]; mayRun: string[]; requiresApproval: string[] };
  markdown: string;
  createdAt: string;
}
