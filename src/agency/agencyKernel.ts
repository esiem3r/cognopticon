import { deriveFieldModel } from "../field/fieldModel";
import { deriveBeliefs } from "../intelligence/beliefEngine";
import { deriveProposals } from "../intelligence/proposalEngine";
import { compileMissionForProposal } from "../intelligence/missionCompiler";
import { deriveSelfDiagnostics } from "../intelligence/selfDiagnostics";
import type { AgencyTickInput, AgencyTickResult, AttentionItem } from "./types";
import { ensureDefaultGoals } from "./goalStack";

export function runAgencyTick(input: AgencyTickInput): AgencyTickResult {
  const timestamp = new Date().toISOString();
  const field = deriveFieldModel(input.nodes, timestamp);
  const updatedGoals = ensureDefaultGoals(input.goals, input.nodes, timestamp);
  const selfBeliefs = deriveSelfDiagnostics(input.nodes, input.events, input.daemonStatus, timestamp);
  const beliefs = [...deriveBeliefs(input.nodes, input.relationships, input.events, timestamp), ...selfBeliefs];
  const proposals = deriveProposals(input.nodes, beliefs, updatedGoals, timestamp);
  const missions = proposals
    .filter((proposal) => proposal.status === "accepted" || proposal.kind === "prepare_demo")
    .slice(0, 3)
    .map((proposal) => compileMissionForProposal(proposal, input.nodes, timestamp));
  const attentionQueue: AttentionItem[] = proposals.slice(0, 8).map((proposal) => ({
    id: `attention:${proposal.id}`,
    kind: "proposal",
    title: proposal.title,
    summary: proposal.summary,
    severity: proposal.urgency >= 85 ? "critical" : proposal.urgency >= 70 ? "warning" : "notice",
    priority: Math.round(proposal.impact + proposal.urgency + proposal.confidence - proposal.effort * 0.35),
    nodeIds: proposal.nodeIds,
    proposalId: proposal.id,
    eventIds: [],
    createdAt: timestamp
  }));
  if (!input.daemonStatus?.online) {
    attentionQueue.push({
      id: "attention:daemon-offline",
      kind: "daemon_status",
      title: "Daemon offline",
      summary: "Local actions will use copy/mission fallbacks until the daemon is available.",
      severity: "notice",
      priority: 58,
      nodeIds: [],
      eventIds: [],
      createdAt: timestamp
    });
  }
  const nodePatches = input.nodes.map((node) => ({ nodeId: node.id, readiness: node.state.readiness, confidence: node.state.confidence, staleness: node.state.staleness }));
  return { events: [], beliefs, proposals, missions, updatedGoals, nodePatches, attentionQueue, fieldAttention: field.attention };
}
