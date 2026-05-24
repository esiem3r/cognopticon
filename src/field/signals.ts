import type { CognopticonNode } from "../model/cognopticonNode";
import type { ProjectSignal } from "./types";

export function deriveSignals(nodes: CognopticonNode[], observedAt = new Date().toISOString()): ProjectSignal[] {
  return nodes.flatMap((node) => {
    const text = node.evidence.map((item) => `${item.label} ${item.path}`.toLowerCase()).join(" ");
    const signals: ProjectSignal[] = [];
    if (/readme/.test(text)) signals.push(signal(node.id, "readme_surface", 0.8, observedAt, "README evidence detected"));
    if (/package\.json|pyproject|cargo\.toml|vite|tsconfig/.test(text)) signals.push(signal(node.id, "build_surface", 0.72, observedAt, "Build/config evidence detected"));
    if (/test|spec|pytest|vitest|playwright/.test(text)) signals.push(signal(node.id, "test_surface", 0.76, observedAt, "Verification evidence detected"));
    if (node.state.staleness > 0.7) signals.push(signal(node.id, "stale_timestamp", node.state.staleness, observedAt, "Node appears stale"));
    if (/\/home\/|\/mnt\/c\/Users|C:\\Users/.test(node.path)) signals.push(signal(node.id, "public_hygiene_risk", 1, observedAt, "Private path detected"));
    return signals;
  });
}

function signal(nodeId: string, kind: ProjectSignal["kind"], strength: number, observedAt: string, label: string): ProjectSignal {
  return { id: `${kind}:${nodeId}`, nodeId, kind, strength, confidence: 0.82, evidence: [{ kind: "scan", label, confidence: 0.82 }], observedAt };
}
