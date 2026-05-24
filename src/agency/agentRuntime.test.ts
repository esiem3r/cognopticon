import { describe, expect, it } from "vitest";
import { admitAgentTask, admitAgentTasks } from "./agentRuntime";
import type { AgentBudget, AgentTask } from "./types";

const budget: AgentBudget = {
  maxRootAgents: 2,
  maxThreads: 3,
  maxDepth: 2,
  maxChildrenPerAgent: 2,
  maxTotalAgents: 4,
  maxRuntimeMs: 900000,
  maxRetries: 1
};

describe("agent runtime admission", () => {
  it("admits bounded root and child tasks", () => {
    const root = task("root", undefined, 0);
    const child = task("child", "root", 1);
    const result = admitAgentTasks([root, child], budget);
    expect(result.accepted.map((item) => item.id)).toEqual(["root", "child"]);
    expect(result.rejected).toEqual([]);
  });

  it("blocks excessive depth, fanout, and active threads", () => {
    const existing = [task("root", undefined, 0), task("a", "root", 1), task("b", "root", 1)];
    expect(admitAgentTask(task("too-deep", "a", 3), existing, budget).reason).toMatch(/maxDepth/);
    expect(admitAgentTask(task("too-many-children", "root", 1), existing, budget).reason).toMatch(/maxChildrenPerAgent/);
    expect(admitAgentTask(task("too-many-threads", undefined, 0), existing, budget).reason).toMatch(/maxThreads/);
  });
});

function task(id: string, parentTaskId: string | undefined, depth: number): AgentTask {
  return {
    id,
    parentTaskId,
    missionId: `mission-${id}`,
    nodeIds: ["node"],
    depth,
    status: "queued",
    assignedPaths: ["/demo/workspace"],
    prompt: "Inspect the project.",
    acceptanceCriteria: ["Return a summary."],
    verificationCommands: ["npm test"],
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z"
  };
}
