import type { CognopticonNode } from "../model/cognopticonNode";
import type { CompiledMission, InterventionProposal } from "./types";
import { defaultExcludedFiles, renderMissionPacketMarkdown, verificationCommandsFromSignals } from "../lib/missionPacket";

export function compileMissionForProposal(proposal: InterventionProposal, nodes: CognopticonNode[], timestamp = new Date().toISOString()): CompiledMission {
  const selectedNodes = nodes.filter((node) => proposal.nodeIds.includes(node.id));
  const title = `Mission: ${proposal.title}`;
  const relevantFiles = selectedNodes.flatMap((node) => [node.path, ...node.evidence.map((item) => item.path)]).filter(Boolean);
  const excludedFiles = defaultExcludedFiles();
  const constraints = [
    "Keep work inside the listed relevant paths unless explicitly redirected.",
    "Do not delete files or rewrite history.",
    "State verification commands and results in the final handoff.",
    ...selectedNodes.flatMap((node) => {
      const mission = node.facets.find((facet) => facet.kind === "mission")?.data as { constraints?: string[] } | undefined;
      return mission?.constraints ?? [];
    })
  ];
  const verificationCommands = verificationCommandsForNodes(selectedNodes);
  const acceptanceCriteria = ["Explain intent before editing.", "Verify or document blocker.", "Report changed files and residual risks."];
  const authority = {
    mayRead: relevantFiles,
    mayEdit: [],
    mayRun: verificationCommands,
    requiresApproval: ["file edits", "commands beyond listed verification", "network access", "git commits or pushes"]
  };
  const markdown = renderMissionPacketMarkdown({
    id: `mission:${proposal.id}`,
    source: "proposal",
    projectIds: proposal.nodeIds,
    title,
    objective: proposal.summary,
    generatedAt: timestamp,
    contextSummary: selectedNodes.map((node) => `- ${node.name}: ${node.facets.find((facet) => facet.kind === "summary")?.summary ?? node.path}`).join("\n") || proposal.rationale,
    currentState: proposal.status,
    relevantFiles,
    excludedFiles,
    knownRisks: proposal.evidence.map((item) => item.label),
    constraints,
    acceptanceCriteria,
    verificationCommands,
    firstActions: [
      "Confirm the proposal still matches local evidence.",
      "Inspect the listed paths before editing.",
      "Choose the smallest reversible change that satisfies the objective.",
      "Stop if the mission conflicts with repository state."
    ],
    authority,
    sections: [
      { heading: "Proposal Rationale", body: proposal.rationale },
      { heading: "Proposal Metrics", body: [`- Impact: ${proposal.impact}`, `- Urgency: ${proposal.urgency}`, `- Confidence: ${proposal.confidence}`, `- Effort: ${proposal.effort}`, `- Reversibility: ${proposal.reversibility}`] }
    ]
  });
  return {
    id: `mission:${proposal.id}`,
    proposalId: proposal.id,
    nodeIds: proposal.nodeIds,
    title,
    objective: proposal.summary,
    contextPacket: {
      canonicalSummary: proposal.rationale,
      relevantFiles,
      excludedFiles,
      knownRisks: proposal.evidence.map((item) => item.label),
      currentState: proposal.status
    },
    constraints,
    acceptanceCriteria,
    verificationCommands,
    agentInstructions: {
      role: "bounded implementation agent",
      style: "evidence-first, scoped, no broad rewrites",
      forbiddenMoves: ["delete files", "git push", "git reset --hard", "edit outside allowed paths without approval"],
      requiredOutputs: ["summary", "verification", "changed files", "remaining risks"]
    },
    authority,
    markdown,
    createdAt: timestamp
  };
}

function verificationCommandsForNodes(nodes: CognopticonNode[]) {
  const launchCommands = nodes.flatMap((node) => node.launch?.commands?.map((command) => `${command.command} ${command.args.join(" ")}`.trim()) ?? []);
  const signalCommands = nodes.flatMap((node) => verificationCommandsFromSignals(node.source.analysis?.signals ?? [], node.evidence.map((item) => item.path)));
  return [...new Set([...launchCommands, ...signalCommands])];
}
