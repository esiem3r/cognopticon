import type { CognopticonNode } from "../model/cognopticonNode";
import type { CognopticonGoal, CognopticonGoalKind } from "./types";

const defaults: Array<{ kind: CognopticonGoalKind; title: string; description: string; priority: number }> = [
  { kind: "prepare_public_release", title: "Prepare Cognopticon for public proof-of-work release", description: "Remove public blockers and make the demo credible.", priority: 100 },
  { kind: "identify_agent_ready_work", title: "Identify agent-ready projects", description: "Find work that can be safely delegated.", priority: 86 },
  { kind: "merge_duplicate_variants", title: "Detect duplicate restart / variant clusters", description: "Expose lineages before another restart loop forms.", priority: 82 },
  { kind: "archive_dead_weight", title: "Surface high-substance dormant work", description: "Force revive/archive decisions.", priority: 74 },
  { kind: "generate_mission", title: "Generate bounded missions instead of vague next steps", description: "Compile context, constraints, and verification.", priority: 90 },
  { kind: "improve_self", title: "Improve Cognopticon's graph-native architecture", description: "Keep the instrument honest about itself.", priority: 94 }
];

export function ensureDefaultGoals(goals: CognopticonGoal[], nodes: CognopticonNode[], timestamp = new Date().toISOString()): CognopticonGoal[] {
  const existing = new Set(goals.map((goal) => goal.kind));
  const selfId = nodes.find((node) => node.kind === "workspace")?.id;
  return [
    ...goals,
    ...defaults.filter((item) => !existing.has(item.kind)).map((item) => ({
      id: `goal:${item.kind}`,
      kind: item.kind,
      title: item.title,
      description: item.description,
      priority: item.priority,
      status: "active" as const,
      nodeIds: item.kind === "prepare_public_release" || item.kind === "improve_self" ? (selfId ? [selfId] : []) : [],
      createdAt: timestamp,
      updatedAt: timestamp
    }))
  ];
}
