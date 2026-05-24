import type { AutonomyPolicy } from "../agency/types";

export const defaultAutonomyPolicy: AutonomyPolicy = {
  autonomyLevel: "prepare_missions",
  allowedRoots: ["/demo/workspace"],
  allowedCommands: ["npm", "node"],
  autoGenerateMissions: true,
  autoRunReadOnlyChecks: false,
  autoLaunchRegisteredTools: false,
  autoDelegateToAgents: false,
  requireApprovalFor: ["file_edits", "file_deletes", "git_commit", "git_push", "external_network", "agent_delegation", "long_running_process"],
  agentBudget: {
    maxRootAgents: 4,
    maxThreads: 8,
    maxDepth: 2,
    maxChildrenPerAgent: 2,
    maxTotalAgents: 16,
    maxRuntimeMs: 900000,
    maxRetries: 1
  }
};
