import { describe, expect, it } from "vitest";
import projectsJson from "../data/projects.json";
import relationshipsJson from "../data/relationships.json";
import type { ProjectDossier, ProjectRelationship } from "../types/cosmopticon";
import { validateCosmopticonData } from "./validateData";

const projects = projectsJson as ProjectDossier[];
const relationships = relationshipsJson as ProjectRelationship[];

describe("Cosmopticon data validation", () => {
  it("accepts the canonical project universe", () => {
    expect(validateCosmopticonData(projects, relationships)).toEqual([]);
  });

  it("rejects duplicate project ids", () => {
    const duplicate = [projects[0], { ...projects[1], id: projects[0].id }];
    expect(validateCosmopticonData(duplicate, [])).toContain(`duplicate project id: ${projects[0].id}`);
  });

  it("rejects broken relationship endpoints", () => {
    const broken = [{ ...relationships[0], target: "missing-project" }];
    expect(validateCosmopticonData(projects, broken)).toContain(`${relationships[0].id}.target points to unknown project: missing-project`);
  });

  it("rejects missing required fields", () => {
    const invalid = [{ ...projects[0], nextMove: "", evidence: [] }];
    const errors = validateCosmopticonData(invalid, []);
    expect(errors).toContain(`${projects[0].id}.nextMove must be a non-empty string`);
    expect(errors).toContain(`${projects[0].id}.evidence must contain at least one item`);
  });
});
