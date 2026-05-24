import type { CognopticonNode } from "../model/cognopticonNode";
import { deriveAffordances } from "./affordances";
import { deriveAttractors } from "./attractors";
import { deriveAttention } from "./attention";
import { deriveLineages } from "./lineages";
import { deriveSignals } from "./signals";
import { deriveStateVectors } from "./stateVector";
import type { FieldModel } from "./types";

export function deriveFieldModel(nodes: CognopticonNode[], timestamp = new Date().toISOString()): FieldModel {
  const signals = deriveSignals(nodes, timestamp);
  const vectors = deriveStateVectors(nodes, signals, timestamp);
  const lineages = deriveLineages(nodes);
  const attractors = deriveAttractors(nodes, vectors, lineages);
  const attention = deriveAttention(attractors);
  const affordances = deriveAffordances(attractors);
  return { signals, vectors, lineages, attractors, attention, affordances };
}
