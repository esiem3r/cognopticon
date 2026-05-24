import type { CognopticonNode } from "./cognopticonNode";

export type AnomalyKind = "duplicate_variant" | "overlapping_path" | "stale_active" | "sleeping_giant" | "public_hygiene_blocker" | "missing_verification" | "unclear_next_move";

export interface NodeAnomaly {
  id: string;
  kind: AnomalyKind;
  nodeIds: string[];
  severity: "notice" | "warning" | "critical";
  summary: string;
  evidence: string[];
}

export function detectAnomalies(nodes: CognopticonNode[]): NodeAnomaly[] {
  const anomalies: NodeAnomaly[] = [];
  const byNormalizedName = new Map<string, CognopticonNode[]>();
  for (const node of nodes) {
    const normalized = normalizeName(node.name);
    byNormalizedName.set(normalized, [...(byNormalizedName.get(normalized) ?? []), node]);
    if (node.state.status === "active" && node.state.staleness > 0.72) {
      anomalies.push({ id: `stale:${node.id}`, kind: "stale_active", nodeIds: [node.id], severity: "warning", summary: `${node.name} is active but stale.`, evidence: [`staleness=${node.state.staleness.toFixed(2)}`] });
    }
    if (node.state.substance > 0.78 && node.state.activity < 0.22) {
      anomalies.push({ id: `sleeping:${node.id}`, kind: "sleeping_giant", nodeIds: [node.id], severity: "notice", summary: `${node.name} has high substance and low activity.`, evidence: [`substance=${node.state.substance.toFixed(2)}`, `activity=${node.state.activity.toFixed(2)}`] });
    }
    if (node.path.includes("/home/") || node.path.includes("/mnt/c/Users/") || node.path.includes("C:\\Users\\")) {
      anomalies.push({ id: `private-path:${node.id}`, kind: "public_hygiene_blocker", nodeIds: [node.id], severity: "critical", summary: `${node.name} contains a private local path.`, evidence: [node.path] });
    }
    const evidenceText = node.evidence.map((item) => `${item.label} ${item.path}`.toLowerCase()).join(" ");
    if (!/test|spec|pytest|vitest|playwright/.test(evidenceText)) {
      anomalies.push({ id: `verify:${node.id}`, kind: "missing_verification", nodeIds: [node.id], severity: "notice", summary: `${node.name} lacks verification evidence.`, evidence: ["No test/spec evidence found."] });
    }
  }
  for (const [name, group] of byNormalizedName.entries()) {
    if (group.length > 1) {
      anomalies.push({ id: `duplicate:${name}`, kind: "duplicate_variant", nodeIds: group.map((node) => node.id), severity: "warning", summary: `${group.length} variants share a normalized name.`, evidence: group.map((node) => node.path) });
    }
  }
  return anomalies;
}

export function normalizeName(name: string) {
  return name.toLowerCase().replace(/\bv?\d+\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
