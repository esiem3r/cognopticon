import type { CompiledMission } from "../intelligence/types";

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
  return mission.markdown;
}
