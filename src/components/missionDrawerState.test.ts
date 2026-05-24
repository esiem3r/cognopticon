import { describe, expect, it } from "vitest";
import type { MissionBrief } from "../types/cognopticon";
import { parseMissionPacketMarkdown, renderMissionPacketMarkdown } from "../lib/missionPacket";
import { missionDrawerDeliveryState } from "./missionDrawerState";

describe("mission drawer delivery state", () => {
  it("allows copy/download/review only for validated packets", () => {
    const brief = missionBrief(renderMissionPacketMarkdown({
      id: "mission:drawer:test",
      source: "project",
      projectIds: ["demo"],
      title: "Mission Brief: Drawer",
      objective: "Validate drawer delivery state.",
      generatedAt: "2026-05-24T06:00:00.000Z",
      contextSummary: "Drawer context.",
      currentState: "Active",
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

    expect(missionDrawerDeliveryState(brief, parseMissionPacketMarkdown(brief.markdown), "draft", undefined)).toMatchObject({
      packetReady: true,
      status: "draft",
      markdownForDelivery: brief.markdown
    });
  });

  it("blocks official delivery controls for malformed packets", () => {
    const brief = missionBrief("# Mission\n\nNo structured packet.");
    const state = missionDrawerDeliveryState(brief, parseMissionPacketMarkdown(brief.markdown), "draft", undefined);

    expect(state).toMatchObject({
      packetReady: false,
      status: "blocked"
    });
    expect(state.markdownForDelivery).toBeUndefined();
    expect(state.summary).toContain("Mission packet JSON block is missing");
  });
});

function missionBrief(markdown: string): MissionBrief {
  return {
    projectId: "demo",
    markdown,
    generatedAt: "2026-05-24T06:00:00.000Z"
  };
}
