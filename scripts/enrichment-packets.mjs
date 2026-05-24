#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRuntimeConfig } from "./runtime-config.mjs";

const runtimeConfig = loadRuntimeConfig();
const inputPath = argValue("--input") ?? runtimeConfig.profile.paths.workspace;
const outputDir = argValue("--output") ?? runtimeConfig.profile.paths.missions;
const enrichmentDir = argValue("--enrichments") ?? runtimeConfig.profile.paths.enrichments;

if (!existsSync(inputPath)) {
  console.error(`Missing workspace input: ${inputPath}`);
  console.error("Run npm run analyze first.");
  process.exit(1);
}

const workspace = JSON.parse(readFileSync(inputPath, "utf8"));
mkdirSync(outputDir, { recursive: true });

for (const project of workspace.projects ?? []) {
  const packet = [
    `# Cognopticon Agent Packet: ${project.name}`,
    "",
    `Project ID: ${project.id}`,
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
    `${join(enrichmentDir, `${project.id}.json`)}`,
    "",
    "## JSON Shape",
    "```json",
    JSON.stringify({
      projectId: project.id,
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
  writeFileSync(join(outputDir, `${project.id}.md`), `${packet}\n`, "utf8");
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
