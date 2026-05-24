import type { CognopticonNode } from "./cognopticonNode";

export function nodeById(nodes: CognopticonNode[], id: string) {
  return nodes.find((node) => node.id === id);
}

export function selectedEcology(nodes: CognopticonNode[], selectedId: string) {
  const selected = nodeById(nodes, selectedId);
  if (!selected) return [];
  const relatedIds = new Set(selected.relationships.flatMap((relationship) => [relationship.source, relationship.target]));
  relatedIds.add(selectedId);
  return nodes.filter((node) => relatedIds.has(node.id));
}

export function launchableNodes(nodes: CognopticonNode[]) {
  return nodes.filter((node) => Boolean(node.launch) && node.state.readiness >= 55);
}
