import { describe, expect, it } from "vitest";
import { hitTest, screenProjects, screenToWorld, worldToScreen } from "./canvas";
import type { ProjectDossier } from "../types/cognopticon";

const project: ProjectDossier = {
  id: "cosmos",
  name: "Cosmos",
  path: "/tmp/cosmos",
  status: "active",
  health: "strong",
  domain: "visualization",
  activity: 1,
  substance: 0.8,
  position: { x: 20, y: -10 },
  purpose: "",
  whyItMatters: "",
  currentFriction: "",
  nextMove: "",
  decision: "build",
  decisionRationale: "Test fixture.",
  nextReview: "2026-05-20",
  missionConstraints: [],
  evidence: [],
  tags: []
};

describe("canvas math", () => {
  it("round trips world and screen coordinates", () => {
    const camera = { x: 5, y: -3, scale: 1.5 };
    const rect = { width: 800, height: 500 };
    const screen = worldToScreen(project.position, camera, rect);
    const world = screenToWorld(screen, camera, rect);
    expect(world.x).toBeCloseTo(project.position.x);
    expect(world.y).toBeCloseTo(project.position.y);
  });

  it("hit tests visible project bodies", () => {
    const screen = screenProjects([project], { x: 0, y: 0, scale: 1 }, { width: 800, height: 500 });
    expect(hitTest(screen, { x: 420, y: 240 })?.id).toBe("cosmos");
    expect(hitTest(screen, { x: 20, y: 20 })).toBeUndefined();
  });
});
