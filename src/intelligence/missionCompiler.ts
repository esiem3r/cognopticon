import type { CognopticonNode } from "../model/cognopticonNode";
import type { CompiledMission, InterventionProposal } from "./types";

export function compileMissionForProposal(proposal: InterventionProposal, nodes: CognopticonNode[], timestamp = new Date().toISOString()): CompiledMission {
  const selectedNodes = nodes.filter((node) => proposal.nodeIds.includes(node.id));
  const title = `Mission: ${proposal.title}`;
  const relevantFiles = selectedNodes.flatMap((node) => [node.path, ...node.evidence.map((item) => item.path)]).filter(Boolean);
  const constraints = [
    "Keep work inside the listed relevant paths unless explicitly redirected.",
    "Do not delete files or rewrite history.",
    "State verification commands and results in the final handoff.",
    ...selectedNodes.flatMap((node) => {
      const mission = node.facets.find((facet) => facet.kind === "mission")?.data as { constraints?: string[] } | undefined;
      return mission?.constraints ?? [];
    })
  ];
  const markdown = [
    `# ${title}`,
    "",
    `Generated: ${timestamp}`,
    "",
    "## Objective",
    proposal.summary,
    "",
    "## Context",
    selectedNodes.map((node) => `- ${node.name}: ${node.facets.find((facet) => facet.kind === "summary")?.summary ?? node.path}`).join("\n"),
    "",
    "## Relevant Files",
    ...relevantFiles.map((path) => `- ${path}`),
    "",
    "## Constraints",
    ...constraints.map((constraint) => `- ${constraint}`),
    "",
    "## Acceptance Criteria",
    "- The agent explains the intended change before editing.",
    "- The result is verified with a concrete command or documented blocker.",
    "- The handoff names changed files, residual risks, and next action.",
    "",
    "## Authority",
    "- Read listed paths.",
    "- Edit only after explicit user approval.",
    "- Do not run destructive commands."
  ].join("\n");
  return {
    id: `mission:${proposal.id}`,
    proposalId: proposal.id,
    nodeIds: proposal.nodeIds,
    title,
    objective: proposal.summary,
    contextPacket: {
      canonicalSummary: proposal.rationale,
      relevantFiles,
      excludedFiles: ["node_modules", "dist", ".git", ".cognopticon/state/events.jsonl"],
      knownRisks: proposal.evidence.map((item) => item.label),
      currentState: proposal.status
    },
    constraints,
    acceptanceCriteria: ["Explain intent before editing.", "Verify or document blocker.", "Report changed files and residual risks."],
    verificationCommands: ["npm test", "npm run build"],
    agentInstructions: {
      role: "bounded implementation agent",
      style: "evidence-first, scoped, no broad rewrites",
      forbiddenMoves: ["delete files", "git push", "git reset --hard", "edit outside allowed paths without approval"],
      requiredOutputs: ["summary", "verification", "changed files", "remaining risks"]
    },
    authority: {
      mayRead: relevantFiles,
      mayEdit: [],
      mayRun: ["npm test", "npm run build"],
      requiresApproval: ["file edits", "long-running commands", "network access"]
    },
    markdown,
    createdAt: timestamp
  };
}
