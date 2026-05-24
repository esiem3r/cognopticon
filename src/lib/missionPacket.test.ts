import { describe, expect, it } from "vitest";
import {
  assertValidMissionPacketMarkdown,
  parseMissionPacketMarkdown,
  renderMissionPacketMarkdown,
  validateMissionPacket
} from "./missionPacket";

const generatedAt = "2026-05-24T05:30:00.000Z";

describe("mission packet parsing and validation", () => {
  it("parses rendered packets into a normalized machine contract", () => {
    const markdown = renderMissionPacketMarkdown({
      id: "mission:test",
      source: "project",
      projectIds: [" demo ", "demo"],
      title: "Mission Brief: Demo",
      objective: "Validate the handoff.",
      generatedAt,
      contextSummary: " Demo context ",
      currentState: "Active",
      relevantFiles: ["/tmp/demo", "/tmp/demo"],
      excludedFiles: ["node_modules", " dist "],
      knownRisks: ["packet drift", "packet drift"],
      constraints: ["Stay scoped."],
      acceptanceCriteria: ["Return verification evidence."],
      firstActions: ["Inspect the repo."],
      verificationCommands: ["npm test", "npm test"],
      authority: {
        mayRead: ["/tmp/demo", "/tmp/demo"],
        mayEdit: [],
        mayRun: ["npm test"],
        requiresApproval: ["file edits", "network access"]
      }
    });

    const parsed = parseMissionPacketMarkdown(markdown);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.errors.join(", "));
    expect(parsed.packet).toMatchObject({
      version: 1,
      source: "project",
      id: "mission:test",
      projectIds: ["demo"],
      context: {
        summary: "Demo context",
        relevantFiles: ["/tmp/demo"],
        excludedFiles: ["node_modules", "dist"],
        knownRisks: ["packet drift"]
      },
      verificationCommands: ["npm test"],
      authority: {
        mayRead: ["/tmp/demo"],
        mayEdit: [],
        mayRun: ["npm test"],
        requiresApproval: ["file edits", "network access"]
      }
    });
    expect(assertValidMissionPacketMarkdown(markdown).id).toBe("mission:test");
  });

  it("fails closed when the Markdown has missing, duplicate, or invalid JSON blocks", () => {
    expect(parseMissionPacketMarkdown("# Mission\n\nNo packet.")).toMatchObject({
      ok: false,
      errors: ["Mission packet JSON block is missing."]
    });

    const duplicated = [
      "```json",
      JSON.stringify(validPacket()),
      "```",
      "```json",
      JSON.stringify(validPacket({ id: "mission:other" })),
      "```"
    ].join("\n");

    expect(parseMissionPacketMarkdown(duplicated)).toMatchObject({
      ok: false,
      errors: ["Mission packet must contain exactly one JSON block."]
    });

    expect(parseMissionPacketMarkdown(["## Handoff Packet", "```json", "{\"broken\":", "```"].join("\n"))).toMatchObject({
      ok: false,
      errors: ["Mission packet JSON block is not valid JSON."]
    });

    expect(parseMissionPacketMarkdown(["## Notes", "```json", JSON.stringify(validPacket()), "```"].join("\n"))).toMatchObject({
      ok: false,
      errors: ["Mission packet JSON block must immediately follow the Handoff Packet heading."]
    });

    expect(parseMissionPacketMarkdown(["## Handoff Packet", "", "```json", JSON.stringify(validPacket()), "```"].join("\n"))).toMatchObject({
      ok: false,
      errors: ["Mission packet JSON block must immediately follow the Handoff Packet heading."]
    });
  });

  it("rejects malformed or authority-unsafe packet objects", () => {
    expect(validateMissionPacket(validPacket({ version: 2 }))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["Mission packet version must be 1."])
    });
    expect(validateMissionPacket(validPacket({ source: "daemon" }))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["Mission packet source must be project or proposal."])
    });
    expect(validateMissionPacket(validPacket({ extra: true }))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["packet has unexpected field extra."])
    });
    expect(validateMissionPacket(validPacket({ projectIds: [] }))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["projectIds must include at least one item."])
    });
    expect(validateMissionPacket(validPacket({ projectIds: [7] }))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["projectIds[0] must be a string."])
    });
    expect(validateMissionPacket(validPacket({ context: { ...validPacket().context, relevantFiles: [] } }))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["context.relevantFiles must include at least one item."])
    });
    expect(validateMissionPacket(validPacket({
      authority: { ...validPacket().authority, mayEdit: ["/tmp/demo"] }
    }))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["Mission packet authority.mayEdit must be empty until explicit edit approval is implemented."])
    });
    expect(validateMissionPacket(validPacket({
      authority: { ...validPacket().authority, requiresApproval: ["network access"] }
    }))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["Mission packet authority.requiresApproval must include file edits."])
    });
    expect(validateMissionPacket(validPacket({ verificationCommands: ["git reset --hard"] }))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["Mission packet command is not allowlisted: git reset --hard."])
    });
    expect(validateMissionPacket(validPacket({ verificationCommands: ["bash -c npm test"] }))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["Mission packet command is not allowlisted: bash -c npm test."])
    });
    expect(validateMissionPacket(validPacket({ verificationCommands: ["npm install"] }))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["Mission packet command is not allowlisted: npm install."])
    });
    expect(validateMissionPacket(validPacket({ verificationCommands: ["npm run check"] }))).toMatchObject({
      ok: true
    });
  });

  it("rejects duplicate object keys before JSON.parse can collapse them", () => {
    const packet = JSON.stringify(validPacket(), null, 2).replace(
      '"authority": {',
      '"authority": {\n    "mayRun": ["npm install"],'
    );

    expect(parseMissionPacketMarkdown(["## Handoff Packet", "```json", packet, "```"].join("\n"))).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(["Mission packet JSON contains duplicate key mayRun."])
    });
  });
});

function validPacket(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    source: "proposal",
    id: "mission:proposal:test",
    projectIds: ["demo"],
    title: "Mission: Demo",
    objective: "Validate the handoff.",
    generatedAt,
    context: {
      summary: "Demo context",
      currentState: "new",
      relevantFiles: ["/tmp/demo"],
      excludedFiles: ["node_modules"],
      knownRisks: ["packet drift"]
    },
    constraints: ["Stay scoped."],
    acceptanceCriteria: ["Return verification evidence."],
    verificationCommands: ["npm test"],
    authority: {
      mayRead: ["/tmp/demo"],
      mayEdit: [],
      mayRun: ["npm test"],
      requiresApproval: ["file edits", "network access"]
    },
    ...overrides
  };
}
