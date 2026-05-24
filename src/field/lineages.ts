import { normalizeName } from "../model/anomalies";
import type { CognopticonNode } from "../model/cognopticonNode";
import type { ProjectLineage } from "./types";

export function deriveLineages(nodes: CognopticonNode[]): ProjectLineage[] {
  const grouped = new Map<string, CognopticonNode[]>();
  for (const node of nodes) {
    const name = normalizeName(node.name);
    grouped.set(name, [...(grouped.get(name) ?? []), node]);
  }
  return [...grouped.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([canonicalName, group]) => {
      const sorted = [...group].sort((a, b) => b.state.substance + b.state.activity - (a.state.substance + a.state.activity));
      return {
        id: `lineage:${canonicalName.replace(/\s+/g, "-")}`,
        canonicalName,
        nodeIds: group.map((node) => node.id),
        rootNodeId: sorted[0]?.id,
        activeBranchId: sorted.find((node) => node.state.status === "active")?.id,
        branches: group.map((node, index) => ({ id: `${node.id}:branch`, nodeId: node.id, role: index === 0 ? "origin" : node.state.status === "archive" ? "archive" : "fork", confidence: 0.72 })),
        recommendedCanonicalNodeId: sorted[0]?.id,
        mergePressure: Math.min(1, group.length * 0.28),
        ambiguity: Math.min(1, group.length * 0.22)
      } satisfies ProjectLineage;
    });
}
