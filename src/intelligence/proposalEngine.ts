import type { CognopticonNode } from "../model/cognopticonNode";
import type { CognopticonGoal } from "../agency/types";
import type { Belief, InterventionProposal } from "./types";

export function deriveProposals(nodes: CognopticonNode[], beliefs: Belief[], goals: CognopticonGoal[], timestamp = new Date().toISOString()): InterventionProposal[] {
  const byNode = new Map(nodes.map((node) => [node.id, node]));
  const proposals: InterventionProposal[] = [];
  for (const belief of beliefs.filter((item) => item.value === true)) {
    const node = byNode.get(belief.subjectId);
    if (!node) continue;
    if (belief.predicate === "should_be_merged") proposals.push(proposal("merge", node, belief, goals, timestamp, `${node.name} lineage merge`, "Resolve duplicate lineage and preserve canonical state.", 86, 78));
    if (belief.predicate === "is_stale_active") proposals.push(proposal("stabilize", node, belief, goals, timestamp, `${node.name} stale-active recovery`, "Convert stale active status into a bounded recovery mission.", 72, 76));
    if (belief.predicate === "is_high_substance_dormant") proposals.push(proposal("archive", node, belief, goals, timestamp, `${node.name} revive/archive decision`, "Force a decision on high-substance dormant work.", 74, 64));
    if (belief.predicate === "has_public_hygiene_blocker") proposals.push(proposal("prepare_demo", node, belief, goals, timestamp, `${node.name} public hygiene pass`, "Remove public-release blockers and make demo evidence safe.", 92, 88));
    if (belief.predicate === "has_missing_verification") proposals.push(proposal("run_check", node, belief, goals, timestamp, `${node.name} verification surface`, "Find or create the smallest verification command.", 68, 58));
    if (belief.predicate === "is_agent_ready") proposals.push(proposal("generate_mission", node, belief, goals, timestamp, `${node.name} bounded mission`, "Turn agent-ready state into a scoped mission packet.", 70, 62));
    if (belief.predicate === "is_launchable") proposals.push(proposal("launch", node, belief, goals, timestamp, `${node.name} launch verification`, "Use safe action bridge or copy-command fallback.", 76, 68));
  }
  return [...new Map(proposals.map((proposal) => [proposal.id, proposal])).values()].sort((a, b) => score(b) - score(a)).slice(0, 12);
}

function proposal(kind: InterventionProposal["kind"], node: CognopticonNode, belief: Belief, goals: CognopticonGoal[], timestamp: string, title: string, summary: string, impact: number, urgency: number): InterventionProposal {
  const matchingGoals = goals.filter((goal) => goal.status === "active" && (goal.nodeIds.length === 0 || goal.nodeIds.includes(node.id)));
  return {
    id: `proposal:${kind}:${node.id}`,
    title,
    summary: `${node.name}: ${summary}`,
    kind,
    nodeIds: [node.id],
    beliefIds: [belief.id],
    goalIds: matchingGoals.map((goal) => goal.id),
    rationale: `${belief.predicate} is true with ${Math.round(belief.confidence * 100)}% confidence.`,
    evidence: belief.evidence,
    impact,
    urgency,
    confidence: Math.round(belief.confidence * 100),
    effort: kind === "prepare_demo" ? 70 : kind === "merge" ? 62 : 42,
    reversibility: kind === "archive" || kind === "merge" ? 56 : 82,
    status: kind === "prepare_demo" ? "accepted" : "new",
    actions: [
      { id: `${node.id}:focus`, label: "Focus Graph", kind: "focus_graph", requiresApproval: false, capabilityId: "focus_graph", payload: { nodeId: node.id } },
      { id: `${node.id}:mission`, label: "Generate Mission", kind: "generate_mission", requiresApproval: false, capabilityId: "generate_mission", payload: { nodeId: node.id, proposalKind: kind } }
    ],
    createdAt: timestamp
  };
}

function score(proposal: InterventionProposal) {
  return proposal.impact * 0.38 + proposal.urgency * 0.34 + proposal.confidence * 0.2 - proposal.effort * 0.08;
}
