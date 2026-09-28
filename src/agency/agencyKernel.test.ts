import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAutonomyPolicy } from "../intelligence/policy";
import { sampleWorkspace } from "../lib/workspace";
import { adaptProjectDossiers } from "../model/adaptProjectDossier";
import { runAgencyTick } from "./agencyKernel";

const workspace = sampleWorkspace;
let nodes: ReturnType<typeof adaptProjectDossiers>;

describe("agency kernel", () => {
  beforeEach(() => {
    // Keep demo-fixture staleness stable before constructing the nodes.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-21T00:00:00.000Z"));
    nodes = adaptProjectDossiers(workspace.projects, workspace.relationships);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("keeps the May demo snapshot's proposal cards meaningfully varied", () => {
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

  it.each(["2026-09-28T00:00:00.000Z", "2040-01-01T00:00:00.000Z"])("prioritizes overdue active work while preserving release-blocker missions at %s", (timestamp) => {
    expect(nodes.find((node) => node.id === "workspace-core")?.state.staleness).toBeLessThanOrEqual(0.7);
    vi.setSystemTime(new Date(timestamp));
    const agedNodes = adaptProjectDossiers(workspace.projects, workspace.relationships);
    const tick = runAgencyTick({
      workspaceId: "demo",
      nodes: agedNodes,
      relationships: workspace.relationships,
      events: [],
      goals: [],
      policy: defaultAutonomyPolicy,
      daemonStatus: { online: false, url: "http://127.0.0.1:8787", checkedAt: timestamp }
    });

    expect(tick.beliefs.find((belief) => belief.id === "belief:is_stale_active:workspace-core")?.value).toBe(true);
    expect(tick.proposals.some((proposal) => proposal.id === "proposal:stabilize:workspace-core")).toBe(true);
    const inactiveIds = new Set(agedNodes.filter((node) => node.state.status !== "active").map((node) => node.id));
    expect(tick.proposals.filter((proposal) => proposal.kind === "stabilize").every((proposal) => !inactiveIds.has(proposal.nodeIds[0]))).toBe(true);
    expect(tick.beliefs.find((belief) => belief.id === "belief:has_missing_verification:proof-forge")?.value).toBe(true);

    const releaseProposalId = "proposal:prepare_demo:release-blocker";
    expect(tick.proposals[0]).toMatchObject({ id: releaseProposalId, status: "accepted" });
    expect(tick.attentionQueue.some((item) => item.proposalId === releaseProposalId)).toBe(true);
    expect(tick.missions.some((mission) => mission.proposalId === releaseProposalId)).toBe(true);
    expect(new Set(tick.proposals.map((proposal) => proposal.id)).size).toBe(tick.proposals.length);
    expect(tick.proposals.length).toBeLessThanOrEqual(12);
  });
});
