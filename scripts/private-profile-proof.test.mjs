import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRedactedReport } from "./private-profile-proof.mjs";

const repoRoot = resolve(".");
const tempRoots = [];

afterEach(() => {
  for (const path of tempRoots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("private profile proof", () => {
  it("proves a configured local profile without exposing paths or rewriting profile workspace state", () => {
    const root = createFixture();
    const reportPath = join(root, ".cognopticon", "profiles", "personal", "proofs", "proof.json");
    const workspaceState = join(root, ".cognopticon", "profiles", "personal", "state", "workspace.json");
    const stateBefore = readFileSync(workspaceState, "utf8");

    const result = spawnSync(process.execPath, [
      "scripts/private-profile-proof.mjs",
      "--report",
      reportPath
    ], { cwd: root, encoding: "utf8", env: childEnv(root) });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Cognopticon private profile proof valid");
    expect(readFileSync(workspaceState, "utf8")).toBe(stateBefore);

    const reportText = readFileSync(reportPath, "utf8");
    const report = JSON.parse(reportText);
    expect(report.profile).toEqual({ id: "personal", rootCount: 1 });
    expect(report.scan.candidateCount).toBeGreaterThanOrEqual(2);
    expect(report.workspace.projectCount).toBe(2);
    expect(report.privacy).toMatchObject({
      redactedReport: true,
      privatePathsInReport: false,
      projectNamesInReport: false,
      profileWorkspaceStateUnchanged: true
    });
    expect(reportText).not.toContain(root);
    expect(reportText).not.toContain("private-alpha");
    expect(reportText).not.toContain("private-beta");
    expect(reportText).not.toContain("secret-token");
    expect(existsSync(join(root, ".cognopticon", "profiles", "personal", "proofs", "private-profile-proof.json"))).toBe(false);
  });

  it("collapses enrichment-controlled labels and rejects report paths outside the private profile proof directory", () => {
    const root = createFixture();
    const outsideReportPath = join(root, "proof.json");

    const result = spawnSync(process.execPath, [
      "scripts/private-profile-proof.mjs",
      "--report",
      outsideReportPath
    ], { cwd: root, encoding: "utf8", env: childEnv(root) });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("report path must stay under");

    const report = buildRedactedReport({
      runtimeConfig: { profile: { id: "personal" } },
      raw: { candidates: [] },
      review: { review: [] },
      workspace: {
        projects: [{
          domain: "client-x-secret-domain",
          status: "private-status",
          health: "client-health",
          decision: "secret-decision"
        }],
        relationships: [],
        analysis: { source: "generated", pendingEnrichment: 1 }
      },
      rootCount: 1,
      stateUnchanged: true
    });
    const text = JSON.stringify(report);
    expect(text).not.toContain("client-x-secret-domain");
    expect(text).not.toContain("private-status");
    expect(text).not.toContain("client-health");
    expect(text).not.toContain("secret-decision");
    expect(report.workspace.domains).toEqual({ custom: 1 });
    expect(report.workspace.statuses).toEqual({ custom: 1 });
    expect(report.workspace.health).toEqual({ custom: 1 });
    expect(report.workspace.decisions).toEqual({ custom: 1 });
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "cognopticon-private-proof-test-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "src", "data"), { recursive: true });
  for (const scriptFile of ["private-profile-proof.mjs", "runtime-config.mjs", "scan-workspace.mjs", "analyze-workspace.mjs"]) {
    cpSync(join(repoRoot, "scripts", scriptFile), join(root, "scripts", scriptFile));
  }
  cpSync(join(repoRoot, "src", "data", "workspace-roots.json"), join(root, "src", "data", "workspace-roots.json"));

  const alpha = join(root, "real-work", "private-alpha");
  const beta = join(root, "real-work", "private-beta");
  createProject(alpha, "private-alpha", ["tests"]);
  createProject(beta, "private-beta", ["src"]);

  const stateDir = join(root, ".cognopticon", "profiles", "personal", "state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "workspace.json"), "{\"sentinel\":true}\n", "utf8");
  writeFileSync(join(root, ".cognopticon", "config.json"), `${JSON.stringify({
    host: "127.0.0.1",
    port: 8787,
    activeProfile: "personal",
    profiles: {
      personal: {
        id: "personal",
        label: "Personal",
        allowedRoots: [join(root, "real-work")]
      }
    },
    daemon: {
      accessToken: "secret-token-for-private-proof-test"
    }
  }, null, 2)}\n`, "utf8");
  return root;
}

function createProject(path, name, extraDirs) {
  mkdirSync(path, { recursive: true });
  for (const dir of extraDirs) mkdirSync(join(path, dir), { recursive: true });
  writeFileSync(join(path, "README.md"), `# ${name}\n`, "utf8");
  writeFileSync(join(path, "package.json"), `${JSON.stringify({ name, private: true }, null, 2)}\n`, "utf8");
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
