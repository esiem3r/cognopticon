import type { Belief } from "../../intelligence/types";

export function BeliefBadge({ belief }: { belief: Belief }) {
  return <span className="belief-badge">{belief.predicate.replace(/_/g, " ")} / {Math.round(belief.confidence * 100)}</span>;
}
