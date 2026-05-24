import type { DaemonStatus } from "../agency/types";
import type { CognopticonNode } from "../model/cognopticonNode";
import type { CognopticonEvent, Belief } from "./types";

export function deriveSelfDiagnostics(nodes: CognopticonNode[], events: CognopticonEvent[], daemonStatus: DaemonStatus | undefined, timestamp = new Date().toISOString()): Belief[] {
  void events;
  const selfNode = nodes.find((node) => node.kind === "workspace" || node.id === "workspace-core" || node.id === "cognopticon");
  if (!selfNode) return [];
  const publicRisk = nodes.some((node) => /\/home\/|\/mnt\/c\/Users|C:\\Users/.test(node.path));
  return [
    diagnostic(selfNode.id, "has_public_hygiene_blocker", publicRisk, publicRisk ? 0.95 : 0.7, "private path scan", timestamp),
    diagnostic(selfNode.id, "is_demo_worthy", !publicRisk, 0.78, "sanitized demo state", timestamp),
    diagnostic(selfNode.id, "has_unclear_next_move", !daemonStatus?.online, 0.64, "daemon status", timestamp)
  ];
}

function diagnostic(subjectId: string, predicate: Belief["predicate"], value: boolean, confidence: number, label: string, timestamp: string): Belief {
  return { id: `self:${predicate}:${subjectId}`, subjectId, predicate, value, confidence, evidence: [{ kind: "metric", label, value, confidence }], source: "self_diagnostic", createdAt: timestamp, updatedAt: timestamp };
}
