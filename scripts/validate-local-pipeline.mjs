#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(join(tmpdir(), "cognopticon-local-pipeline-"));
const profileId = "first-run";
const workflowScriptCommands = {
  "local:init": "node scripts/local-init.mjs",
  scan: "node scripts/scan-workspace.mjs --profile-output",
  analyze: "node scripts/analyze-workspace.mjs"
};
const workflowScripts = Object.keys(workflowScriptCommands);
const repoPrivateStatePath = join(repoRoot, ".cognopticon");
const repoPrivateStateSnapshot = snapshotTree(repoPrivateStatePath);
const repoPackageJson = readJson(join(repoRoot, "package.json"));

try {
  setupValidationPackage();
  const workspaceRoot = join(tempRoot, "workspace");
  const toolsRoot = join(workspaceRoot, "tools");
  const researchRoot = join(workspaceRoot, "research");
  const templateRoot = join(workspaceRoot, "templates");
  const launchableTool = join(toolsRoot, "launchable-tool");
  const proofForge = join(researchRoot, "proof-forge");
  const starter = join(templateRoot, "python-package-starter");

  createProject(launchableTool, "launchable-tool", ["tests"]);
  createProject(proofForge, "proof-forge", ["src"]);
  createProject(starter, "your-package", ["src"]);

  runNpmScript("local:init", ["--", "--profile", profileId, "--roots", [toolsRoot, researchRoot, templateRoot].join(",")]);
  runNpmScript("scan");
  runNpmScript("analyze");

  const config = readJson(join(tempRoot, ".cognopticon", "config.json"));
  const raw = readJson(join(tempRoot, ".cognopticon", "profiles", profileId, "state", "workspace.raw.json"));
  const workspace = readJson(join(tempRoot, ".cognopticon", "profiles", profileId, "state", "workspace.json"));
  const review = readJson(join(tempRoot, ".cognopticon", "profiles", profileId, "state", "scan-review.json"));
  const tempPackage = readJson(join(tempRoot, "package.json"));
  const serializedArtifacts = JSON.stringify({ config, raw, workspace, review });

  for (const script of workflowScripts) {
    assert(tempPackage.scripts?.[script] === workflowScriptCommands[script], `temp validation package should clone package.json script: ${script}`);
  }
  assert(snapshotTree(repoPrivateStatePath) === repoPrivateStateSnapshot, "validate:local should not modify the real repository .cognopticon state");
  assert(config.activeProfile === profileId, "local init should set the requested active profile");
  assert(config.profiles?.[profileId]?.allowedRoots?.length === 3, "local init should persist all configured roots");
  assert(config.profiles[profileId].allowedRoots.every((root) => root.startsWith(tempRoot)), "local init should persist temp roots only");
  assert(typeof config.daemon?.accessToken === "string" && config.daemon.accessToken.length >= 24, "local init should create a daemon token");
  assert(raw.profile?.id === profileId, "scan output should be scoped to the active profile");
  assert(raw.profile?.stateDir?.startsWith(tempRoot), "scan profile stateDir should stay under the temp validation root");
  assert(workspace.profile?.id === profileId, "analysis output should be scoped to the active profile");
  assert(workspace.profile?.stateDir?.startsWith(tempRoot), "analysis profile stateDir should stay under the temp validation root");
  assert(raw.roots.length === 3 && raw.roots.every((root) => root.startsWith(tempRoot)), "scan should use configured local roots, not demo roots");
  assert(workspace.projects.some((project) => project.path === launchableTool), "analysis should include a real local tool project");
  assert(workspace.projects.some((project) => project.path === proofForge), "analysis should include a real local research project");
  assert(!workspace.projects.some((project) => project.path === starter), "analysis should keep template candidates out of the active graph");
  assert(raw.review.some((candidate) => candidate.path === starter && candidate.projectKind === "template"), "scan review should preserve hidden template evidence");
  assert(review.review.some((candidate) => candidate.path === starter), "profile review artifact should include hidden candidates for human review");
  assert(Array.isArray(workspace.relationships) && workspace.relationships.length > 0, "analysis should emit a non-empty relationships array");
  const projectIdByPath = new Map(workspace.projects.map((project) => [project.path, project.id]));
  const launchableToolId = projectIdByPath.get(launchableTool);
  assert(
    workspace.relationships.some((relationship) => relationship.source === launchableToolId || relationship.target === launchableToolId),
    "analysis should connect the local tool project to another project"
  );
  assert(workspace.analysis?.source === "generated", "first-run analysis should declare generated local evidence");
  assert(!serializedArtifacts.includes(repoRoot), "generated local validation artifacts should not contain the real repository root");

  console.log(`Cognopticon local pipeline valid through npm scripts: profile ${profileId}, ${workspace.projects.length} projects, ${workspace.relationships.length} relationships.`);
} finally {
  if (!process.env.COGNOPTICON_KEEP_LOCAL_VALIDATION) rmSync(tempRoot, { recursive: true, force: true });
}

function setupValidationPackage() {
  const scripts = {};
  for (const script of workflowScripts) {
    for (const hook of [`pre${script}`, `post${script}`]) {
      assert(repoPackageJson.scripts?.[hook] === undefined, `validate:local must model npm lifecycle hook before package.json adds ${hook}`);
    }
    const command = repoPackageJson.scripts?.[script];
    assert(command === workflowScriptCommands[script], `package.json script "${script}" must remain exactly "${workflowScriptCommands[script]}" for validate:local to model it safely`);
    scripts[script] = command;
  }
  mkdirSync(join(tempRoot, "scripts"), { recursive: true });
  mkdirSync(join(tempRoot, "src", "data"), { recursive: true });
  for (const scriptFile of ["local-init.mjs", "runtime-config.mjs", "scan-workspace.mjs", "analyze-workspace.mjs"]) {
    cpSync(join(repoRoot, "scripts", scriptFile), join(tempRoot, "scripts", scriptFile));
  }
  cpSync(join(repoRoot, "src", "data", "workspace-roots.json"), join(tempRoot, "src", "data", "workspace-roots.json"));
  writeFileSync(join(tempRoot, "package.json"), `${JSON.stringify({
    name: "cognopticon-local-pipeline-validation",
    private: true,
    type: "module",
    scripts
  }, null, 2)}\n`, "utf8");
}

function createProject(path, name, extraDirs) {
  mkdirSync(path, { recursive: true });
  for (const dir of extraDirs) mkdirSync(join(path, dir), { recursive: true });
  writeFileSync(join(path, "README.md"), `# ${name}\n\nLocal validation fixture.\n`, "utf8");
  writeFileSync(join(path, "package.json"), `${JSON.stringify({ name, version: "0.0.0", private: true }, null, 2)}\n`, "utf8");
}

function runNpmScript(script, args = []) {
  const childEnv = {
    ...minimalChildEnv(),
    COGNOPTICON_RELATIONSHIP_LIMIT: "160",
    COGNOPTICON_RELATIONSHIPS_PER_NODE: "8"
  };
  assert(childEnv.COGNOPTICON_PROFILE === undefined, "validation child env must strip COGNOPTICON_PROFILE");
  assert(childEnv.NODE_OPTIONS === undefined, "validation child env must strip NODE_OPTIONS");
  const result = spawnSync(npmCommand(), ["run", script, ...args], {
    cwd: tempRoot,
    encoding: "utf8",
    env: childEnv
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`npm run ${script} failed with exit code ${result.status}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function minimalChildEnv() {
  const env = {};
  for (const name of ["PATH", "Path", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT"]) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  const allowedNpmConfig = new Set([
    "npm_config_audit",
    "npm_config_fund",
    "npm_config_update_notifier",
    "npm_config_cache",
    "npm_config_userconfig",
    "npm_config_globalconfig"
  ]);
  const childEnv = {
    ...env,
    HOME: tempRoot,
    USERPROFILE: tempRoot,
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    CI: process.env.CI ?? "1",
    FORCE_COLOR: "0",
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    npm_config_cache: join(tempRoot, ".npm-cache"),
    npm_config_userconfig: join(tempRoot, ".npmrc"),
    npm_config_globalconfig: join(tempRoot, ".npm-globalrc")
  };
  for (const key of Object.keys(childEnv)) {
    if (/^npm_config_/i.test(key) && !allowedNpmConfig.has(key)) {
      throw new Error(`validation child env includes unmodeled npm config: ${key}`);
    }
  }
  return childEnv;
}

function snapshotTree(root) {
  if (!existsSync(root)) return "missing";
  const entries = [];
  const walk = (directory, prefix = "") => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = statSync(path);
      const hash = stat.isDirectory() ? "" : createHash("sha256").update(readFileSync(path)).digest("hex");
      entries.push([relative, stat.isDirectory() ? "dir" : "file", stat.size, Math.round(stat.mtimeMs), hash]);
      if (stat.isDirectory()) walk(path, relative);
    }
  };
  walk(root);
  return JSON.stringify(entries);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
