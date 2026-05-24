import type { CompiledMission } from "../intelligence/types";
import { assertValidMissionPacketMarkdown, type MissionPacket } from "../lib/missionPacket";

export type AgentAdapterKind = "manual_copy" | "codex_cli" | "openai_agents" | "claude_code" | "local_script";

export interface AgentAdapter {
  kind: AgentAdapterKind;
  available: boolean;
  label: string;
}

export const agentAdapters: AgentAdapter[] = [
  { kind: "manual_copy", available: true, label: "Manual Copy" },
  { kind: "codex_cli", available: false, label: "Codex CLI" },
  { kind: "openai_agents", available: false, label: "OpenAI Agents" },
  { kind: "claude_code", available: false, label: "Claude Code" },
  { kind: "local_script", available: false, label: "Local Script" }
];

export function prepareManualCopyMission(mission: CompiledMission) {
  assertValidMissionPacketMarkdown(mission.markdown);
  return mission.markdown;
}

export function prepareManualAgentHandoffPrompt(markdown: string) {
  const packet = assertValidMissionPacketMarkdown(markdown);
  return renderManualAgentHandoffPrompt(packet);
}

function renderManualAgentHandoffPrompt(packet: MissionPacket) {
  return [
    `You are the worker Codex instance for ${packet.title}.`,
    "",
    `Objective: ${packet.objective}`,
    `Mission ID: ${packet.id}`,
    `Projects: ${packet.projectIds.join(", ")}`,
    "",
    "Authority boundary:",
    ...authorityLines("May read", packet.authority.mayRead),
    ...authorityLines("May edit", packet.authority.mayEdit.length ? packet.authority.mayEdit : ["No edit authority granted by this packet. Ask the supervisor before editing."]),
    ...authorityLines("May run", packet.authority.mayRun),
    ...authorityLines("Requires approval", packet.authority.requiresApproval),
    "",
    "Working rules:",
    "- Read the validated packet context below before changing anything.",
    "- Keep work inside the packet scope and explicit authority boundary.",
    "- Do not start new daemon, agent, git, network, or destructive operations unless the packet and supervisor explicitly allow them.",
    "- Return changed files, verification commands and results, residual risks, and any authority you did not use.",
    "- Stop and report back if the current repo state, public/private boundary, or daemon safety model conflicts with the mission.",
    "",
    "Validated packet context:",
    `- Current state: ${packet.context.currentState}`,
    `- Summary: ${packet.context.summary}`,
    ...authorityLines("Relevant files", packet.context.relevantFiles),
    ...authorityLines("Excluded files", packet.context.excludedFiles),
    ...authorityLines("Known risks", packet.context.knownRisks),
    ...authorityLines("Constraints", packet.constraints),
    ...authorityLines("Acceptance criteria", packet.acceptanceCriteria),
    ...authorityLines("Verification commands", packet.verificationCommands),
    "",
    "Validated handoff packet:",
    "```json",
    JSON.stringify(packet, null, 2),
    "```",
    ""
  ].join("\n");
}

function authorityLines(label: string, values: string[]) {
  return [`- ${label}:`, ...values.map((value) => `  - ${value}`)];
}
