import type { CognopticonNode } from "../model/cognopticonNode";
import type { ProjectRelationship } from "../types/cognopticon";
import type { CognopticonEvent, Belief, BeliefPredicate } from "./types";

export function deriveBeliefs(nodes: CognopticonNode[], relationships: ProjectRelationship[], events: CognopticonEvent[], timestamp = new Date().toISOString()): Belief[] {
  void relationships;
  void events;
  return nodes.flatMap((node) => {
    const beliefs: Belief[] = [];
    push(beliefs, node.id, "is_agent_ready", node.state.readiness >= 68, node.state.confidence, timestamp, `readiness=${node.state.readiness}`);
    push(beliefs, node.id, "is_launchable", Boolean(node.launch) && node.state.readiness >= 70, node.launch ? 0.82 : 0.5, timestamp, "launch spec and readiness");
    push(beliefs, node.id, "is_stale_active", node.state.status === "active" && node.state.staleness > 0.7, 0.76, timestamp, `staleness=${node.state.staleness.toFixed(2)}`);
    push(beliefs, node.id, "is_high_substance_dormant", node.state.substance > 0.78 && node.state.activity < 0.25, 0.8, timestamp, "high substance, low activity");
    push(beliefs, node.id, "has_public_hygiene_blocker", /\/home\/|\/mnt\/c\/Users|C:\\Users/.test(node.path) || node.name.toLowerCase().includes("release blocker"), 0.82, timestamp, "public hygiene scan");
    push(beliefs, node.id, "has_missing_verification", node.state.readiness < 68 && !node.evidence.some((item) => /test|spec|playwright|vitest|pytest/i.test(`${item.label} ${item.path}`)), 0.78, timestamp, "verification evidence missing");
    push(beliefs, node.id, "has_unclear_next_move", !node.facets.some((facet) => facet.kind === "mission" && facet.summary && facet.summary.length > 12), 0.68, timestamp, "mission facet clarity");
    push(beliefs, node.id, "is_demo_worthy", node.state.substance > 0.62 && node.source.scanner === "demo", 0.74, timestamp, "demo source and substance");
    push(beliefs, node.id, "should_be_merged", node.state.decision === "merge", 0.84, timestamp, "decision=merge");
    push(beliefs, node.id, "should_be_archived", node.state.decision === "archive", 0.84, timestamp, "decision=archive");
    return beliefs;
  });
}

function push(beliefs: Belief[], subjectId: string, predicate: BeliefPredicate, value: boolean | number | string, confidence: number, timestamp: string, label: string) {
  beliefs.push({
    id: `belief:${predicate}:${subjectId}`,
    subjectId,
    predicate,
    value,
    confidence,
    evidence: [{ kind: "metric", label, value, confidence }],
    source: "heuristic",
    createdAt: timestamp,
    updatedAt: timestamp
  });
}
