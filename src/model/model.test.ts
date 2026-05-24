import { describe, expect, it } from "vitest";
import { sampleWorkspace } from "../lib/workspace";
import { adaptProjectDossiers } from "./adaptProjectDossier";
import { detectAnomalies } from "./anomalies";
import { computeReadiness } from "./readiness";

const workspace = sampleWorkspace;
const nodes = adaptProjectDossiers(workspace.projects, workspace.relationships);

describe("canonical Cognopticon node model", () => {
  it("adapts legacy dossiers into operational nodes", () => {
    const launchable = nodes.find((node) => node.id === "launchable-tool");
    expect(launchable?.kind).toBe("tool");
    expect(launchable?.launch?.commands?.[0].command).toBe("npm");
    expect(launchable?.facets.some((facet) => facet.kind === "mission")).toBe(true);
  });

  it("computes readiness from evidence and launch state", () => {
    const launchable = nodes.find((node) => node.id === "launchable-tool");
    expect(launchable).toBeDefined();
    if (!launchable) return;
    const readiness = computeReadiness(launchable);
    expect(readiness.score).toBeGreaterThan(70);
    expect(readiness.reasons).toContain("Launch spec is present");
  });

  it("detects duplicate and sleeping-giant anomalies", () => {
    const anomalies = detectAnomalies(nodes);
    expect(anomalies.some((item) => item.kind === "duplicate_variant")).toBe(true);
    expect(anomalies.some((item) => item.kind === "sleeping_giant")).toBe(true);
  });
});
