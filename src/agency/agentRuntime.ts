import type { AgentBudget, AgentTask } from "./types";

export interface AgentAdmissionResult {
  admitted: boolean;
  reason?: string;
}

export function admitAgentTask(task: AgentTask, existingTasks: AgentTask[], budget: AgentBudget): AgentAdmissionResult {
  if (task.depth > budget.maxDepth) return blocked(`task depth ${task.depth} exceeds maxDepth ${budget.maxDepth}`);
  if (existingTasks.length >= budget.maxTotalAgents) return blocked(`agent tree already has ${existingTasks.length} task(s); maxTotalAgents is ${budget.maxTotalAgents}`);

  if (!task.parentTaskId) {
    const rootCount = existingTasks.filter((item) => !item.parentTaskId).length;
    if (rootCount >= budget.maxRootAgents) return blocked(`root agent count already at ${rootCount}; maxRootAgents is ${budget.maxRootAgents}`);
    return admitThreadCapacity(existingTasks, budget);
  }

  const parent = existingTasks.find((item) => item.id === task.parentTaskId);
  if (!parent) return blocked(`parent task ${task.parentTaskId} was not found`);
  const siblingCount = existingTasks.filter((item) => item.parentTaskId === task.parentTaskId).length;
  if (siblingCount >= budget.maxChildrenPerAgent) {
    return blocked(`parent already has ${siblingCount} child task(s); maxChildrenPerAgent is ${budget.maxChildrenPerAgent}`);
  }
  if (task.depth !== parent.depth + 1) return blocked(`child depth ${task.depth} must be exactly parent depth ${parent.depth} + 1`);
  return admitThreadCapacity(existingTasks, budget);
}

export function admitAgentTasks(tasks: AgentTask[], budget: AgentBudget) {
  const accepted: AgentTask[] = [];
  const rejected: AgentTask[] = [];
  for (const task of tasks) {
    const result = admitAgentTask(task, accepted, budget);
    if (result.admitted) accepted.push({ ...task, status: "admitted", blockedReason: undefined });
    else rejected.push({ ...task, status: "blocked", blockedReason: result.reason });
  }
  return { accepted, rejected };
}

function blocked(reason: string): AgentAdmissionResult {
  return { admitted: false, reason };
}

function admitThreadCapacity(existingTasks: AgentTask[], budget: AgentBudget): AgentAdmissionResult {
  const activeCount = existingTasks.filter((item) => item.status === "queued" || item.status === "admitted" || item.status === "running").length;
  if (activeCount >= budget.maxThreads) return blocked(`active agent threads already at ${activeCount}; maxThreads is ${budget.maxThreads}`);
  return { admitted: true };
}
