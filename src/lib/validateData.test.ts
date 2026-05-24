import { describe, expect, it } from "vitest";
import projectsJson from "../data/projects.json";
import relationshipsJson from "../data/relationships.json";
import rootsJson from "../data/workspace-roots.json";
import type { CognopticonWorkspace } from "../types/cognopticon";
import { validateCognopticonData, validatePublicDemoWorkspace } from "./validateData";

const demo = {
  projects: projectsJson,
  relationships: relationshipsJson,
  roots: rootsJson
} as Pick<CognopticonWorkspace, "projects" | "relationships" | "roots">;
const projects = demo.projects;
const relationships = demo.relationships;

describe("Cognopticon data validation", () => {
  it("accepts the canonical project universe", () => {
    expect(validateCognopticonData(projects, relationships)).toEqual([]);
  });

  it("rejects duplicate project ids", () => {
    const duplicate = [projects[0], { ...projects[1], id: projects[0].id }];
    expect(validateCognopticonData(duplicate, [])).toContain(`duplicate project id: ${projects[0].id}`);
  });

  it("rejects broken relationship endpoints", () => {
    const broken = [{ ...relationships[0], target: "missing-project" }];
    expect(validateCognopticonData(projects, broken)).toContain(`${relationships[0].id}.target points to unknown project: missing-project`);
  });

  it("rejects missing required fields", () => {
    const invalid = [{ ...projects[0], nextMove: "", evidence: [] }];
    const errors = validateCognopticonData(invalid, []);
    expect(errors).toContain(`${projects[0].id}.nextMove must be a non-empty string`);
    expect(errors).toContain(`${projects[0].id}.evidence must contain at least one item`);
  });

  it("rejects private paths in public demo data", () => {
    const demoProject = { ...projects[0], path: "/home/example/private-project" };
    const errors = validatePublicDemoWorkspace([demoProject], ["/demo/workspace"]);
    expect(errors.some((error) => error.includes("private local path"))).toBe(true);
  });

  it("accepts sanitized demo paths", () => {
    const demoProject = {
      ...projects[0],
      path: "/demo/workspace/private-project",
      evidence: projects[0].evidence.map((item) => ({ ...item, path: item.path.replace(/^\/home\/[^/]+/, "/demo/workspace") }))
    };
    expect(validatePublicDemoWorkspace([demoProject], ["/demo/workspace"])).toEqual([]);
  });
});
