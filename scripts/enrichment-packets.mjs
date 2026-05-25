#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { loadRuntimeConfig } from "./runtime-config.mjs";

const runtimeConfig = loadRuntimeConfig(process.cwd(), { requireInitialized: true });
const inputPath = resolve(argValue("--input") ?? runtimeConfig.profile.paths.workspace);
const outputDir = resolve(argValue("--output") ?? runtimeConfig.profile.paths.missions);
const enrichmentDir = resolve(argValue("--enrichments") ?? runtimeConfig.profile.paths.enrichments);
const profileRoot = runtimeConfig.profile.paths.rootDir;
const profileRootReal = realpathSync(profileRoot);

assertInsideProfile(inputPath, "workspace input path");
assertInsideProfile(outputDir, "mission packet output directory");
assertInsideProfile(enrichmentDir, "enrichment output directory");

if (!existsSync(inputPath)) {
  console.error(`Missing workspace input: ${inputPath}`);
  console.error("Run npm run analyze first.");
  process.exit(1);
}

const workspace = JSON.parse(readFileSync(inputPath, "utf8"));
mkdirSync(outputDir, { recursive: true });
mkdirSync(enrichmentDir, { recursive: true });
assertInsideProfileReal(outputDir, "mission packet output directory");
assertInsideProfileReal(enrichmentDir, "enrichment output directory");

if (workspace.profile?.id !== runtimeConfig.profile.id) {
  console.error(`Workspace profile "${workspace.profile?.id ?? "missing"}" does not match active profile "${runtimeConfig.profile.id}".`);
  process.exit(1);
}

for (const project of workspace.projects ?? []) {
  const projectId = safeProjectId(project.id);
  const enrichmentPath = join(enrichmentDir, `${projectId}.json`);
  const packetPath = join(outputDir, `${projectId}.md`);
  assertInsideDirectory(enrichmentPath, enrichmentDir, "enrichment file path");
  assertInsideDirectory(packetPath, outputDir, "mission packet file path");
  const packet = [
    `# Cognopticon Agent Packet: ${project.name}`,
    "",
    `Project ID: ${projectId}`,
    `Path: ${project.path}`,
    `Detected domain: ${project.domain}`,
    `Detected signals: ${(project.analysis?.signals ?? []).join(", ") || "unknown"}`,
    "",
    "## Task",
    "Inspect this project and write a structured enrichment JSON file. Do not edit project code unless separately instructed.",
    "",
    "## Questions To Answer",
    "- What is this project actually for?",
    "- What is its current maturity and main friction?",
    "- What is the next smallest useful action?",
    "- Which other local projects does it relate to, and why?",
    "- What evidence did you rely on?",
    "",
    "## Output File",
    enrichmentPath,
    "",
    "## JSON Shape",
    "```json",
    JSON.stringify({
      projectId,
      purpose: "",
      whyItMatters: "",
      currentFriction: "",
      nextMove: "",
      status: "active | forming | legacy | paused | archive",
      health: "strong | promising | fragile | stalled | unknown",
      domain: project.domain,
      decision: "build | triage | merge | pause | archive",
      decisionRationale: "",
      missionConstraints: [`Stay inside ${project.path} unless explicitly redirected.`],
      tags: [],
      relationshipNotes: []
    }, null, 2),
    "```"
  ].join("\n");
  writeFileSync(packetPath, `${packet}\n`, "utf8");
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assertInsideProfile(path, label) {
  if (isInside(path, profileRoot)) return;
  console.error(`Cognopticon ${label} must stay under ${relative(process.cwd(), profileRoot) || profileRoot}.`);
  console.error("Generated enrichment packets contain private project names and paths.");
  process.exit(1);
}

function assertInsideProfileReal(path, label) {
  const real = realpathSync(path);
  if (isInside(real, profileRootReal)) return;
  console.error(`Cognopticon ${label} resolves outside the active profile tree.`);
  console.error("Generated enrichment packets contain private project names and paths.");
  process.exit(1);
}

function assertInsideDirectory(path, directory, label) {
  if (isInside(path, directory)) return;
  console.error(`Cognopticon ${label} must stay under ${relative(process.cwd(), directory) || directory}.`);
  console.error("Generated enrichment packets contain private project names and paths.");
  process.exit(1);
}

function safeProjectId(value) {
  const id = String(value ?? "");
  if (/^[a-z0-9][a-z0-9-]{0,159}$/i.test(id)) return id;
  console.error(`Unsafe project id for enrichment packet path: ${id || "missing"}`);
  process.exit(1);
}

function isInside(target, root) {
  const resolvedTarget = resolve(target);
  const resolvedRoot = resolve(root);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${sep}`);
}
