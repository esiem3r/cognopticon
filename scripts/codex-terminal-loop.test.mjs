import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(".");
const tempRoots = [];

afterEach(() => {
  for (const path of tempRoots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("codex terminal loop launcher", () => {
  it("places global search before exec and accepts a child-written report", () => {
    const fixture = createFixture();
    const result = runLauncher(fixture, { mode: "write-report" });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const args = readArgs(fixture.argsPath);
    expect(args.indexOf("--search")).toBeGreaterThan(-1);
    expect(args.indexOf("--search")).toBeLessThan(args.indexOf("exec"));
    expect(args).toContain("--output-last-message");
    expect(readFileSync(fixture.agent.artifactPath, "utf8")).toContain("fake child report");

    const selected = JSON.parse(readFileSync(join(fixture.runDir, "terminal-agents", "selected-agents.json"), "utf8"));
    expect(selected.searchEnabledAgentIds).toEqual(["terminal-researcher"]);

    const terminalRun = JSON.parse(readFileSync(join(fixture.runDir, "terminal-agents", "terminal-run.json"), "utf8"));
    expect(terminalRun.results[0]).toMatchObject({
      exitCode: 0,
      timedOut: false,
      reportExists: true,
      reportGeneratedByLauncher: false
    });
  });

  it("fails when a child exits without writing its required report", () => {
    const fixture = createFixture();
    const result = runLauncher(fixture, { mode: "no-report" });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
    expect(result.stderr).toContain("launcher-generated");
    const terminalRun = JSON.parse(readFileSync(join(fixture.runDir, "terminal-agents", "terminal-run.json"), "utf8"));
    expect(terminalRun.results[0]).toMatchObject({
      exitCode: 0,
      timedOut: false,
      reportExists: true,
      reportGeneratedByLauncher: true
    });
    expect(readFileSync(fixture.agent.artifactPath, "utf8")).toContain("completed-without-report");
  });

  it("generates a manual launch script that re-enters the audited Node launcher", () => {
    const fixture = createFixture();
    const result = runPrepare(fixture);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const script = readFileSync(join(fixture.runDir, "terminal-agents", "launch-agents.sh"), "utf8");
    const mode = statSync(join(fixture.runDir, "terminal-agents", "launch-agents.sh")).mode & 0o777;
    expect(mode).toBe(0o755);
    expect(script).toContain("scripts/codex-terminal-loop.mjs");
    expect(script).toContain("'--packet'");
    expect(script).toContain("'--roles'");
    expect(script).toContain("'terminal-researcher'");
    expect(script).toContain("'--timeout-ms'");
    expect(script).toContain("'--launch'");
    expect(script).not.toContain("pids=()");
    expect(script).not.toContain("'codex'");
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "cognopticon-terminal-loop-test-"));
  tempRoots.push(root);
  const runDir = join(root, "packet");
  const terminalDir = join(runDir, "terminal-agents");
  const fakeBin = join(root, "bin");
  mkdirSync(terminalDir, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });

  const fakeCodexPath = join(fakeBin, "codex");
  const argsPath = join(root, "codex-args.txt");
  writeFileSync(fakeCodexPath, fakeCodexScript(), "utf8");
  chmodSync(fakeCodexPath, 0o755);

  const terminalAgentsPath = join(runDir, "terminal-agents.json");
  const run = {
    id: "test-loop",
    objective: "Exercise terminal launcher contracts",
    researchRequired: true,
    artifacts: {
      supervisor: join(runDir, "supervisor.md"),
      researchBrief: join(runDir, "research-brief.md"),
      planner: join(runDir, "planner.md"),
      mission: join(runDir, "mission.md"),
      terminalOrchestrator: join(runDir, "terminal-orchestrator.md"),
      terminalAgents: terminalAgentsPath
    }
  };
  const agent = {
    id: "terminal-researcher",
    role: "researcher",
    parentAgentId: "root-supervisor",
    loopId: run.id,
    objective: "Research prior art. Lifecycle objective: Exercise terminal launcher contracts",
    readScope: ["README.md"],
    writeScope: [],
    allowedCommands: ["rg"],
    stopCondition: "Return a bounded report.",
    artifactPath: join(terminalDir, "terminal-researcher.report.md"),
    promptPath: join(terminalDir, "terminal-researcher.prompt.md"),
    maySpawnChildren: false,
    remainingDepth: 0,
    network: true,
    searchByDefault: true,
    daemonActions: false,
    gitWrites: false,
    sandboxMode: "read-only",
    requiresWriteMode: false,
    defaultLaunch: true
  };
  const manifest = {
    version: 1,
    mode: "codex_internal_terminal",
    objective: run.objective,
    budget: { maxFreshTerminals: 3, maxDepthInsideTerminal: 2 },
    agents: [agent]
  };

  writeFileSync(join(runDir, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
  writeFileSync(terminalAgentsPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { root, runDir, fakeBin, argsPath, agent };
}

function runLauncher(fixture, { mode }) {
  return spawnSync(process.execPath, [
    "scripts/codex-terminal-loop.mjs",
    "--packet",
    fixture.runDir,
    "--roles",
    "terminal-researcher",
    "--max-agents",
    "1",
    "--launch",
    "--timeout-ms",
    "5000"
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fixture.fakeBin}:${process.env.PATH ?? ""}`,
      CODEX_FAKE_ARGS: fixture.argsPath,
      CODEX_FAKE_MODE: mode
    }
  });
}

function runPrepare(fixture) {
  return spawnSync(process.execPath, [
    "scripts/codex-terminal-loop.mjs",
    "--packet",
    fixture.runDir,
    "--roles",
    "terminal-researcher",
    "--max-agents",
    "1",
    "--timeout-ms",
    "5000"
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fixture.fakeBin}:${process.env.PATH ?? ""}`
    }
  });
}

function readArgs(path) {
  return readFileSync(path, "utf8").split("\n").filter(Boolean);
}

function fakeCodexScript() {
  return `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "$CODEX_FAKE_ARGS"
output=''
previous=''
for arg in "$@"; do
  if [ "$previous" = '--output-last-message' ]; then
    output="$arg"
  fi
  previous="$arg"
done
if [ "$CODEX_FAKE_MODE" = 'write-report' ]; then
  printf '# fake child report\n' > "$output"
fi
exit 0
`;
}
