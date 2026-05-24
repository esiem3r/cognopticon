import { describe, expect, it } from "vitest";
import type { CompiledMission } from "../intelligence/types";
import { renderMissionPacketMarkdown } from "../lib/missionPacket";
import { prepareManualAgentHandoffPrompt, prepareManualCopyMission } from "./agentAdapters";

describe("agent adapters", () => {
  it("validates mission packet Markdown before manual copy handoff", () => {
    const mission = compiledMission(renderMissionPacketMarkdown({
      id: "mission:adapter:test",
      source: "proposal",
      projectIds: ["demo"],
      title: "Mission: Adapter",
      objective: "Validate before handoff.",
      generatedAt: "2026-05-24T05:40:00.000Z",
      contextSummary: "Adapter context.",
      currentState: "new",
      relevantFiles: ["/tmp/demo"],
      excludedFiles: ["node_modules"],
      knownRisks: [],
      constraints: ["Stay scoped."],
      acceptanceCriteria: ["Return verification evidence."],
      firstActions: ["Inspect local state."],
      verificationCommands: ["npm test"],
      authority: {
        mayRead: ["/tmp/demo"],
        mayEdit: [],
        mayRun: ["npm test"],
        requiresApproval: ["file edits", "network access"]
      }
    }));

    expect(prepareManualCopyMission(mission)).toBe(mission.markdown);
  });

  it("refuses malformed mission packet Markdown", () => {
    const mission = compiledMission("# Mission\n\nNo structured packet.");

    expect(() => prepareManualCopyMission(mission)).toThrow(/Mission packet JSON block is missing/);
    expect(() => prepareManualAgentHandoffPrompt(mission.markdown)).toThrow(/Mission packet JSON block is missing/);
  });

  it("renders a bounded worker prompt from validated packet Markdown", () => {
    const renderedMission = renderMissionPacketMarkdown({
      id: "mission:adapter:worker",
      source: "proposal",
      projectIds: ["demo"],
      title: "Mission: Worker Prompt",
      objective: "Give a second Codex terminal a bounded task.",
      generatedAt: "2026-05-24T05:45:00.000Z",
      contextSummary: "Worker prompt context.",
      currentState: "ready",
      relevantFiles: ["/tmp/demo"],
      excludedFiles: ["node_modules", ".cognopticon"],
      knownRisks: ["authority drift"],
      constraints: ["Stay scoped."],
      acceptanceCriteria: ["Return verification evidence."],
      firstActions: ["Inspect local state."],
      verificationCommands: ["npm test"],
      authority: {
        mayRead: ["/tmp/demo"],
        mayEdit: [],
        mayRun: ["npm test"],
        requiresApproval: ["file edits", "network access"]
      }
    });
    const mission = compiledMission(`${renderedMission}\n\n## Supervisor Private Notes\nDo not forward this private prose or daemonToken=secret.`);

    const prompt = prepareManualAgentHandoffPrompt(mission.markdown);

    expect(prompt).toContain("You are the worker Codex instance for Mission: Worker Prompt.");
    expect(prompt).toContain("No edit authority granted by this packet");
    expect(prompt).toContain("Do not start new daemon, agent, git, network, or destructive operations");
    expect(prompt).toContain("Validated packet context:");
    expect(prompt).toContain("Validated handoff packet:");
    expect(prompt).toContain('"id": "mission:adapter:worker"');
    expect(prompt).not.toContain("Supervisor Private Notes");
    expect(prompt).not.toContain("daemonToken=secret");
  });
});

function compiledMission(markdown: string): CompiledMission {
  return {
    id: "mission:adapter:test",
    proposalId: "proposal:test",
    nodeIds: ["demo"],
    title: "Mission: Adapter",
    objective: "Validate before handoff.",
    contextPacket: {
      canonicalSummary: "Adapter context.",
      relevantFiles: ["/tmp/demo"],
      excludedFiles: ["node_modules"],
      knownRisks: [],
      currentState: "new"
    },
    constraints: ["Stay scoped."],
    acceptanceCriteria: ["Return verification evidence."],
    verificationCommands: ["npm test"],
    agentInstructions: {
      role: "Builder",
      style: "bounded",
      forbiddenMoves: ["Unapproved edits."],
      requiredOutputs: ["Verification evidence."]
    },
    authority: {
      mayRead: ["/tmp/demo"],
      mayEdit: [],
      mayRun: ["npm test"],
      requiresApproval: ["file edits", "network access"]
    },
    markdown,
    createdAt: "2026-05-24T05:40:00.000Z"
  };
}
