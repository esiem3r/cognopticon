import { describe, expect, it } from "vitest";
import { sampleWorkspace } from "../lib/workspace";
import { adaptProjectDossiers } from "../model/adaptProjectDossier";
import type { InterventionProposal } from "./types";
import { compileMissionForProposal } from "./missionCompiler";

const nodes = adaptProjectDossiers(sampleWorkspace.projects, sampleWorkspace.relationships);

describe("mission compiler", () => {
  it("renders proposal missions as structured agent handoff packets", () => {
    const node = nodes.find((item) => item.id === "cognopticon") ?? nodes[0];
    const proposal: InterventionProposal = {
      id: "proposal:test",
      title: "Cognopticon bounded mission",
      summary: "Turn agent-ready state into a scoped mission packet.",
      kind: "generate_mission",
      nodeIds: [node.id],
      beliefIds: ["belief:test"],
      goalIds: ["goal:test"],
      rationale: "is_agent_ready is true with 91% confidence.",
      evidence: [{ kind: "scan", label: "agent-ready belief", path: node.path }],
      impact: 70,
      urgency: 62,
      confidence: 91,
      effort: 42,
      reversibility: 82,
      status: "new",
      actions: [],
      createdAt: "2026-05-24T00:00:00.000Z"
    };

    const mission = compileMissionForProposal(proposal, nodes, "2026-05-24T00:00:00.000Z");

    expect(mission.markdown).toContain("# Mission: Cognopticon bounded mission");
    expect(mission.markdown).toContain("## Handoff Packet");
    expect(mission.markdown).toContain('"version": 1');
    expect(mission.markdown).toContain('"source": "proposal"');
    expect(mission.markdown).toContain('"authority"');
    expect(mission.markdown).toContain('"excludedFiles"');
    const packet = handoffPacket(mission.markdown);
    expect(packet.authority).toEqual(mission.authority);
    expect(packet.context.excludedFiles).toEqual(mission.contextPacket.excludedFiles);
    expect(mission.authority.mayRead).toContain(node.path);
    expect(mission.authority.mayEdit).toEqual([]);
    expect(mission.authority.requiresApproval).toContain("file edits");
    expect(mission.verificationCommands).toContain("npm test");
  });
});

function handoffPacket(markdown: string) {
  const match = markdown.match(/```json\n([\s\S]*?)\n```/);
  if (!match) throw new Error("Mission handoff packet JSON block missing");
  return JSON.parse(match[1]);
}
