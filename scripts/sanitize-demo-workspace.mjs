#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { loadRuntimeConfig } from "./runtime-config.mjs";

const runtimeConfig = loadRuntimeConfig();
const inputPath = argValue("--input") ?? runtimeConfig.profile.paths.workspace;
const outputPath = argValue("--output") ?? "src/data/demo-workspace.json";
const workspace = JSON.parse(readFileSync(inputPath, "utf8"));
const pathMap = new Map();
let index = 0;

function sanitizePath(value) {
  if (typeof value !== "string") return value;
  if (!/(\/home\/|\/mnt\/c\/Users\/|C:\\Users\\)/i.test(value)) return value;
  const parts = value.replace(/\\/g, "/").split("/").filter(Boolean);
  const leaf = parts[parts.length - 1] || `project-${index}`;
  if (!pathMap.has(value)) {
    index += 1;
    pathMap.set(value, `/demo/workspace/${String(index).padStart(2, "0")}-${leaf.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase()}`);
  }
  return pathMap.get(value);
}

function walk(value) {
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key.toLowerCase().includes("path") || key === "roots" ? walk(item) : walk(item)]));
  return sanitizePath(value);
}

const sanitized = walk({ ...workspace, title: "Cognopticon Demo Workspace", roots: ["/demo/workspace"], analysis: { ...(workspace.analysis ?? {}), source: "sample" } });
writeFileSync(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
if (!hasFlag("--combined-only")) {
  writeFileSync("src/data/workspace-meta.json", `${JSON.stringify({
    generatedAt: sanitized.generatedAt,
    title: sanitized.title,
    analysis: sanitized.analysis ?? { source: "sample" }
  }, null, 2)}\n`, "utf8");
  writeFileSync("src/data/projects.json", `${JSON.stringify(sanitized.projects ?? [], null, 2)}\n`, "utf8");
  writeFileSync("src/data/relationships.json", `${JSON.stringify(sanitized.relationships ?? [], null, 2)}\n`, "utf8");
  writeFileSync("src/data/workspace-roots.json", `${JSON.stringify(sanitized.roots ?? ["/demo/workspace"], null, 2)}\n`, "utf8");
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}
