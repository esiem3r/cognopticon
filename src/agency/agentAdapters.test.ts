import { describe, expect, it } from "vitest";
import type { CompiledMission } from "../intelligence/types";
import { renderMissionPacketMarkdown } from "../lib/missionPacket";
import { prepareManualCopyMission } from "./agentAdapters";

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
