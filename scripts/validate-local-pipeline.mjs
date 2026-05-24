#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(join(tmpdir(), "cognopticon-local-pipeline-"));
const profileId = "first-run";

try {
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

  runScript("local-init.mjs", ["--profile", profileId, "--roots", [toolsRoot, researchRoot, templateRoot].join(",")]);
  runScript("scan-workspace.mjs", ["--profile-output"], { COGNOPTICON_PROFILE: profileId });
  runScript("analyze-workspace.mjs", [], { COGNOPTICON_PROFILE: profileId });

  const config = readJson(join(tempRoot, ".cognopticon", "config.json"));
  const raw = readJson(join(tempRoot, ".cognopticon", "profiles", profileId, "state", "workspace.raw.json"));
  const workspace = readJson(join(tempRoot, ".cognopticon", "profiles", profileId, "state", "workspace.json"));
  const review = readJson(join(tempRoot, ".cognopticon", "profiles", profileId, "state", "scan-review.json"));

  assert(config.activeProfile === profileId, "local init should set the requested active profile");
  assert(config.profiles?.[profileId]?.allowedRoots?.length === 3, "local init should persist all configured roots");
  assert(typeof config.daemon?.accessToken === "string" && config.daemon.accessToken.length >= 24, "local init should create a daemon token");
  assert(raw.profile?.id === profileId, "scan output should be scoped to the active profile");
  assert(workspace.profile?.id === profileId, "analysis output should be scoped to the active profile");
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

  console.log(`Cognopticon local pipeline valid: profile ${profileId}, ${workspace.projects.length} projects, ${workspace.relationships.length} relationships.`);
} finally {
  if (!process.env.COGNOPTICON_KEEP_LOCAL_VALIDATION) rmSync(tempRoot, { recursive: true, force: true });
}

function createProject(path, name, extraDirs) {
  mkdirSync(path, { recursive: true });
  for (const dir of extraDirs) mkdirSync(join(path, dir), { recursive: true });
  writeFileSync(join(path, "README.md"), `# ${name}\n\nLocal validation fixture.\n`, "utf8");
  writeFileSync(join(path, "package.json"), `${JSON.stringify({ name, version: "0.0.0", private: true }, null, 2)}\n`, "utf8");
}

function runScript(script, args, env = {}) {
  const childEnv = {
    ...process.env,
    ...env,
    COGNOPTICON_RELATIONSHIP_LIMIT: "160",
    COGNOPTICON_RELATIONSHIPS_PER_NODE: "8"
  };
  const result = spawnSync(process.execPath, [join(repoRoot, "scripts", script), ...args], {
    cwd: tempRoot,
    encoding: "utf8",
    env: childEnv
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${script} failed with exit code ${result.status}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
