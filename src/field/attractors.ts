import type { CognopticonNode } from "../model/cognopticonNode";
import type { Attractor, FieldModel, ProjectStateVector } from "./types";

export function deriveAttractors(nodes: CognopticonNode[], vectors: ProjectStateVector[], lineages: FieldModel["lineages"]): Attractor[] {
  const byId = new Map(vectors.map((vector) => [vector.nodeId, vector]));
  const attractors: Attractor[] = [];
  for (const lineage of lineages) {
    attractors.push({
      id: `attractor:duplicate:${lineage.id}`,
      kind: "duplicate_restart_loop",
      nodeIds: lineage.nodeIds,
      intensity: lineage.mergePressure,
      confidence: 0.82,
      stability: 0.72,
      signature: ["duplicate names", "lineage ambiguity"],
      evidence: lineage.nodeIds.map((nodeId) => ({ kind: "metric", label: "lineage member", value: nodeId })),
      preferredTransformations: ["merge_lineage", "extract_core"]
    });
  }
  for (const node of nodes) {
    const vector = byId.get(node.id);
    if (!vector) continue;
    if (vector.verificationDepth < 0.25) attractors.push(simple(node.id, "verification_gap", vector, ["verify", "generate_agent_mission"]));
    if (vector.publicHygieneRisk > 0.55) attractors.push(simple(node.id, "public_release_blocker", vector, ["public_release_harden"]));
    if (vector.substance > 0.78 && vector.traction < 0.25) attractors.push(simple(node.id, "sleeping_giant", vector, ["revive", "archive_with_summary"]));
    if (node.launch) attractors.push(simple(node.id, "launchable_tool", vector, ["launch", "verify"]));
    if (node.kind === "research") attractors.push(simple(node.id, "proof_forge", vector, ["verify", "document"]));
    if (node.kind === "archive") attractors.push(simple(node.id, "archive_fossil", vector, ["archive_with_summary"]));
    if (node.kind === "agent_harness" && vector.authorityRisk > 0.65) attractors.push(simple(node.id, "agent_trap", vector, ["generate_agent_mission"]));
    if (node.id === "workspace-core") attractors.push(simple(node.id, "demo_anchor", vector, ["self_improve", "public_release_harden"]));
  }
  return attractors;
}

function simple(nodeId: string, kind: Attractor["kind"], vector: ProjectStateVector, preferredTransformations: Attractor["preferredTransformations"]): Attractor {
  return {
    id: `attractor:${kind}:${nodeId}`,
    kind,
    nodeIds: [nodeId],
    intensity: Math.max(vector.publicHygieneRisk, vector.entropy, vector.substance),
    confidence: vector.confidence,
    stability: 0.64,
    signature: [kind.replace(/_/g, " ")],
    evidence: [{ kind: "metric", label: kind, value: vector.nodeId, confidence: vector.confidence }],
    preferredTransformations
  };
}
