import { describe, expect, it } from "vitest";
import { defaultAutonomyPolicy } from "../intelligence/policy";
import { sampleWorkspace } from "../lib/workspace";
import { adaptProjectDossiers } from "../model/adaptProjectDossier";
import { runAgencyTick } from "./agencyKernel";

const workspace = sampleWorkspace;
const nodes = adaptProjectDossiers(workspace.projects, workspace.relationships);

describe("agency kernel", () => {
  it("produces goals, beliefs, proposals, missions, and attention", () => {
    const tick = runAgencyTick({
      workspaceId: "demo",
      nodes,
      relationships: workspace.relationships,
      events: [],
      goals: [],
      policy: defaultAutonomyPolicy,
      daemonStatus: { online: false, url: "http://127.0.0.1:8787", checkedAt: "2026-05-21T00:00:00.000Z" }
    });
    expect(tick.updatedGoals.length).toBeGreaterThanOrEqual(6);
    expect(tick.beliefs.length).toBeGreaterThan(nodes.length);
    expect(tick.proposals.length).toBeGreaterThan(0);
    expect(tick.missions.length).toBeGreaterThan(0);
    expect(tick.attentionQueue.some((item) => item.kind === "daemon_status")).toBe(true);
  });

  it("keeps proposal cards meaningfully varied", () => {
    const tick = runAgencyTick({
      workspaceId: "demo",
      nodes,
      relationships: workspace.relationships,
      events: [],
      goals: [],
      policy: defaultAutonomyPolicy,
      daemonStatus: { online: false, url: "http://127.0.0.1:8787", checkedAt: "2026-05-21T00:00:00.000Z" }
    });
    const titles = tick.proposals.map((proposal) => proposal.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.some((title) => title.includes("public hygiene pass"))).toBe(true);
    expect(titles.some((title) => title.includes("verification surface"))).toBe(true);
  });
});
