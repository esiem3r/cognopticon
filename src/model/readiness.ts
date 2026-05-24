import type { CognopticonNode } from "./cognopticonNode";

export type ReadinessLabel = "launchable" | "agent-ready" | "needs-triage" | "blocked";

export interface ReadinessBreakdown {
  score: number;
  label: ReadinessLabel;
  reasons: string[];
  blockers: string[];
}

export function computeReadiness(node: CognopticonNode): ReadinessBreakdown {
  const reasons: string[] = [];
  const blockers: string[] = [];
  let score = 0;
  const evidenceText = node.evidence.map((item) => `${item.label} ${item.path}`.toLowerCase()).join("\n");

  if (/readme/.test(evidenceText)) {
    score += 14;
    reasons.push("README evidence present");
  } else blockers.push("No README evidence detected");

  if (/package\.json|pyproject\.toml|cargo\.toml|go\.mod|requirements\.txt|vite\.config|tsconfig/.test(evidenceText)) {
    score += 14;
    reasons.push("Project configuration evidence present");
  } else blockers.push("No project configuration evidence detected");

  if (/test|spec|pytest|vitest|playwright|jest|cargo test/.test(evidenceText)) {
    score += 16;
    reasons.push("Verification surface detected");
  } else blockers.push("No verification surface detected");

  if (node.state.confidence >= 0.72) {
    score += 12;
    reasons.push("Analysis confidence is high");
  } else blockers.push("Analysis confidence is low");

  if (node.state.health === "strong" || node.state.health === "promising") {
    score += 12;
    reasons.push(`Health is ${node.state.health}`);
  } else blockers.push(`Health is ${node.state.health}`);

  if (node.state.decision === "build" || node.state.decision === "launch") {
    score += 12;
    reasons.push(`Decision is ${node.state.decision}`);
  }

  if (node.launch?.commands?.length || node.launch?.entrypoint) {
    score += 14;
    reasons.push("Launch spec is present");
  }

  if (node.facets.some((facet) => facet.kind === "anomalies")) {
    score -= 16;
    blockers.push("Anomaly facet present");
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: bounded,
    label: bounded >= 84 ? "launchable" : bounded >= 68 ? "agent-ready" : bounded >= 42 ? "needs-triage" : "blocked",
    reasons,
    blockers
  };
}
