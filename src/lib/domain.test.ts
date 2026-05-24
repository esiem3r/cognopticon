import { describe, expect, it } from "vitest";
import { focusModeMatches, generateMissionBrief, nextActionQueue, projectMatches, relatedProjects, scoreProject } from "./domain";
import type { ProjectDossier, ProjectRelationship } from "../types/cognopticon";

const projects: ProjectDossier[] = [
  {
    id: "one",
    name: "One",
    path: "/tmp/one",
    status: "active",
    health: "strong",
    domain: "agentics",
    activity: 0.8,
    substance: 0.7,
    position: { x: 0, y: 0 },
    purpose: "Agent mission control",
    whyItMatters: "It keeps work bounded.",
    currentFriction: "Needs stronger briefs.",
    nextMove: "Generate a brief.",
    decision: "build",
    decisionRationale: "It is central.",
    nextReview: "2026-05-20",
    missionConstraints: ["Stay scoped."],
    evidence: [{ label: "Root", path: "/tmp/one", kind: "repo" }],
    tags: ["agents"]
  },
  {
    id: "two",
    name: "Two",
    path: "/tmp/two",
    status: "forming",
    health: "promising",
    domain: "memory",
    activity: 0.3,
    substance: 0.4,
    position: { x: 10, y: 10 },
    purpose: "Memory substrate",
    whyItMatters: "It remembers context.",
    currentFriction: "Thin adapter.",
    nextMove: "Write adapter.",
    decision: "triage",
    decisionRationale: "It needs classification.",
    nextReview: "2026-05-19",
    missionConstraints: ["Preserve evidence."],
    evidence: [],
    tags: ["memory"]
  }
];

const relationships: ProjectRelationship[] = [
  { id: "rel", source: "one", target: "two", kind: "feeds", label: "feeds context", strength: 0.8 }
];

describe("domain helpers", () => {
  it("finds related projects", () => {
    expect(relatedProjects("one", projects, relationships)).toHaveLength(1);
  });

  it("generates constrained mission briefs", () => {
    const brief = generateMissionBrief(projects[0], projects, relationships, "2026-05-19T00:00:00.000Z");
    expect(brief.markdown).toContain("# Mission Brief: One");
    expect(brief.markdown).toContain("## Handoff Packet");
    expect(brief.markdown).toContain('"source": "project"');
    expect(brief.markdown).toContain('"authority"');
    expect(brief.markdown).toContain('"excludedFiles"');
    expect(handoffPacket(brief.markdown).authority).toMatchObject({
      mayRead: ["/tmp/one"],
      mayEdit: [],
      requiresApproval: expect.arrayContaining(["file edits"])
    });
    expect(brief.markdown).toContain("Stay scoped.");
    expect(brief.markdown).toContain("Two: feeds context");
    expect(brief.markdown).toContain("Build: It is central.");
    expect(brief.markdown).not.toContain("data:text/markdown");
  });

  it("matches project text and scores active work", () => {
    expect(projectMatches(projects[0], "mission")).toBe(true);
    expect(scoreProject(projects[0])).toBeGreaterThan(scoreProject(projects[1]));
  });

  it("filters focus modes and sorts the next action queue", () => {
    expect(focusModeMatches(projects[1], "triage")).toBe(true);
    expect(nextActionQueue(projects)[0].id).toBe("one");
  });
});

function handoffPacket(markdown: string) {
  const match = markdown.match(/```json\n([\s\S]*?)\n```/);
  if (!match) throw new Error("Mission handoff packet JSON block missing");
  return JSON.parse(match[1]);
}
