import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(".");
const tempRoots = [];

afterEach(() => {
  for (const path of tempRoots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("lifecycle packet generator", () => {
  it("records disabled research and UX rationale without default-launching the researcher", () => {
    const root = createTempRepo();
    const result = spawnSync(process.execPath, [
      "scripts/lifecycle-loop.mjs",
      "--objective",
      "Review staged release payload",
      "--read-only",
      "--research",
      "off",
      "--research-reason",
      "Read-only adversarial review; no product direction is being locked.",
      "--ux",
      "off",
      "--ux-reason",
      "No frontend edits are authorized in this packet."
    ], { cwd: root, encoding: "utf8", env: childEnv(root) });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const runDir = packetPath(result.stdout);
    const run = readJson(join(runDir, "run.json"));

    expect(run.researchRequired).toBe(false);
    expect(run.uxRequired).toBe(false);
    expect(run.readOnly).toBe(true);
    expect(run.researchSkipReason).toContain("Read-only adversarial review");
    expect(run.uxSkipReason).toContain("No frontend edits");
    expect(run.phaseOrder).not.toContain("researcher");
    expect(run.phaseOrder).not.toContain("research_brief");
    expect(run.phaseOrder).not.toContain("ux_auditor");

    const researchBrief = readFileSync(run.artifacts.researchBrief, "utf8");
    expect(researchBrief).toContain("[x] skipped with explicit supervisor approval");
    expect(researchBrief).toContain("Supervisor approval: `--research off`");
    expect(researchBrief).not.toContain("|  |  |  |  |  |  |  |");

    const uxAuditor = readFileSync(run.artifacts.uxAuditor, "utf8");
    expect(uxAuditor).toContain("[x] skipped with explicit supervisor approval");
    expect(uxAuditor).toContain("Supervisor approval: `--ux off`");

    const mission = readFileSync(run.artifacts.mission, "utf8");
    expect(mission).toContain("read-only lifecycle packet");
    expect(mission).toContain("Do not implement");
    expect(mission).not.toContain("Implement the slice completely");

    const manifest = readJson(run.artifacts.terminalAgents);
    expect(manifest.rootSupervisor.mayMutateTrackedFiles).toBe(false);
    expect(manifest.agents.find((agent) => agent.id === "terminal-researcher")?.defaultLaunch).toBe(false);
    const reviewer = manifest.agents.find((agent) => agent.id === "terminal-reviewer");
    expect(reviewer?.defaultLaunch).toBe(true);
    expect(reviewer?.readScope).toContain("daemon/");
    expect(reviewer?.readScope).toContain("test-results/ux-audit/report.md");
    expect(reviewer?.allowedCommands).toContain("git diff --cached --stat");

    const validation = spawnSync(process.execPath, [
      "scripts/validate-lifecycle-packet.mjs",
      "--packet",
      runDir
    ], { cwd: root, encoding: "utf8", env: childEnv(root) });
    expect(validation.status, `${validation.stdout}\n${validation.stderr}`).toBe(0);
  });
});

function createTempRepo() {
  const root = mkdtempSync(join(tmpdir(), "cognopticon-lifecycle-loop-test-"));
  tempRoots.push(root);
  cpSync(join(repoRoot, "scripts"), join(root, "scripts"), { recursive: true });
  return root;
}

function packetPath(stdout) {
  const match = stdout.match(/Created Cognopticon lifecycle packet: (.+)\s*$/m);
  if (!match) throw new Error(`packet path missing from output: ${stdout}`);
  return match[1].trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function childEnv(root) {
  return {
    ...process.env,
    HOME: root,
    USERPROFILE: root,
    TMPDIR: root,
    TMP: root,
    TEMP: root,
    CI: process.env.CI ?? "1",
    FORCE_COLOR: "0"
  };
}
