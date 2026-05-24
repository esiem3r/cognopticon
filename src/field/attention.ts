import type { Attractor, AttentionRegion } from "./types";

export function deriveAttention(attractors: Attractor[]): AttentionRegion[] {
  return attractors
    .map((attractor) => ({
      id: `attention:${attractor.id}`,
      nodeIds: attractor.nodeIds,
      reason: attractor.kind === "public_release_blocker" ? "urgent_blocker" : attractor.kind === "duplicate_restart_loop" ? "lineage_anomaly" : attractor.kind === "launchable_tool" ? "agent_ready" : "high_leverage",
      salience: Math.round(attractor.intensity * 100),
      confidence: attractor.confidence,
      suggestedMode: attractor.kind === "duplicate_restart_loop" ? "merge" : attractor.kind === "archive_fossil" ? "archive" : attractor.kind === "public_release_blocker" ? "demo" : "triage"
    } satisfies AttentionRegion))
    .sort((a, b) => b.salience - a.salience);
}
