import { describe, expect, it } from "vitest";
import { sampleWorkspace } from "../lib/workspace";
import { adaptProjectDossiers } from "../model/adaptProjectDossier";
import { deriveFieldModel } from "./fieldModel";

const workspace = sampleWorkspace;
const nodes = adaptProjectDossiers(workspace.projects, workspace.relationships);

describe("field model", () => {
  it("derives vectors, lineages, attractors, attention, and affordances", () => {
    const field = deriveFieldModel(nodes, "2026-05-21T00:00:00.000Z");
    expect(field.vectors).toHaveLength(nodes.length);
    expect(field.lineages.some((lineage) => lineage.nodeIds.includes("operator-studio-v2"))).toBe(true);
    expect(field.attractors.some((attractor) => attractor.kind === "duplicate_restart_loop")).toBe(true);
    expect(field.attention.length).toBeGreaterThan(0);
    expect(field.affordances.some((affordance) => affordance.kind === "merge_lineage")).toBe(true);
  });
});
