import type { Attractor, Affordance } from "./types";

export function deriveAffordances(attractors: Attractor[]): Affordance[] {
  return attractors.flatMap((attractor) => attractor.preferredTransformations.map((kind) => ({
    id: `affordance:${kind}:${attractor.id}`,
    nodeIds: attractor.nodeIds,
    kind,
    label: labelFor(kind),
    description: `Suggested transformation for ${attractor.kind.replace(/_/g, " ")}.`,
    enabled: true,
    readiness: Math.round(attractor.confidence * 100),
    risk: Math.round((1 - attractor.stability) * 100),
    expectedStateChange: { entropy: Math.max(0, 1 - attractor.intensity) },
    requiredConditions: ["User confirmation for any local action."],
    blockedBy: [],
    visualEncoding: {
      portKind: kind === "launch" ? "launch" : kind === "merge_lineage" ? "merge" : kind.includes("archive") ? "archive" : kind === "verify" ? "inspect" : "dock",
      accent: kind === "merge_lineage" ? "violet" : kind === "public_release_harden" ? "amber" : kind === "archive_with_summary" ? "magenta" : "cyan",
      intensity: attractor.intensity
    }
  } satisfies Affordance)));
}

function labelFor(kind: Affordance["kind"]) {
  return kind.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}
