import type { CognopticonNode } from "../model/cognopticonNode";
import type { ProjectSignal, ProjectStateVector } from "./types";

export function deriveStateVectors(nodes: CognopticonNode[], signals: ProjectSignal[], updatedAt = new Date().toISOString()): ProjectStateVector[] {
  return nodes.map((node) => {
    const nodeSignals = signals.filter((signal) => signal.nodeId === node.id);
    const has = (kind: ProjectSignal["kind"]) => nodeSignals.some((signal) => signal.kind === kind);
    const relationshipDensity = Math.min(node.relationships.length / 6, 1);
    const verificationDepth = has("test_surface") ? 0.78 : 0.12;
    const documentationDepth = has("readme_surface") ? 0.75 : 0.18;
    const runtimeClarity = has("build_surface") || node.launch ? 0.72 : 0.18;
    const duplicatePressure = node.name.toLowerCase().includes(" v2") || node.state.decision === "merge" ? 0.78 : 0.1;
    const publicHygieneRisk = has("public_hygiene_risk") ? 1 : node.name.toLowerCase().includes("release") ? 0.62 : 0.08;
    const missionClarity = node.actions.some((action) => action.kind === "generate_mission") ? 0.7 : 0.2;
    return {
      nodeId: node.id,
      substance: node.state.substance,
      maturity: node.state.maturity,
      verificationDepth,
      documentationDepth,
      runtimeClarity,
      traction: node.state.activity,
      staleness: node.state.staleness,
      friction: node.state.health === "fragile" ? 0.8 : node.state.health === "unknown" ? 0.58 : 0.28,
      contextLoad: Math.min(node.facets.length / 10 + relationshipDensity * 0.4, 1),
      closurePressure: node.state.decision === "build" ? 0.72 : node.state.decision === "triage" ? 0.5 : 0.28,
      noveltyPull: node.kind === "research" || node.kind === "agent_harness" ? 0.72 : 0.32,
      dependencyGravity: relationshipDensity,
      relationshipDensity,
      lineageAmbiguity: duplicatePressure,
      duplicatePressure,
      isolation: 1 - relationshipDensity,
      agentSuitability: clamp((verificationDepth + documentationDepth + missionClarity + node.state.confidence) / 4, 0, 1),
      missionClarity,
      authorityRisk: node.kind === "agent_harness" ? 0.76 : 0.22,
      blastRadius: node.kind === "workspace" || node.kind === "service" ? 0.72 : 0.32,
      demoWorthiness: clamp(node.state.substance * 0.45 + node.state.confidence * 0.35 + (node.id === "workspace-core" ? 0.2 : 0), 0, 1),
      publicHygieneRisk,
      narrativeStrength: node.kind === "writing" || node.id === "workspace-core" ? 0.78 : 0.38,
      entropy: clamp(1 - node.state.maturity + duplicatePressure * 0.3 + node.state.staleness * 0.25, 0, 1),
      confidence: node.state.confidence,
      updatedAt
    };
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
