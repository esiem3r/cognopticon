#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const requiredEntries = [
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "docs/release-checklist.md",
  "package.json",
  "src/data/workspace-meta.json",
  "src/data/projects.json",
  "src/data/relationships.json",
  "src/data/workspace-roots.json"
];
const forbiddenPatterns = [
  /^\.cognopticon\//,
  /^\.github\//,
  /^_cognopticon_safety\//,
  /^\.env(?:\.|$)/,
  /^dist\//,
  /^missions\//,
  /^node_modules\//,
  /^playwright-report\//,
  /^public\/workspace\.json$/,
  /^src\/data\/demo-workspace\.json$/,
  /^test-results\//,
  /^tests\/fixtures\//,
  /^workspace-scan\.json$/,
  /\.tgz$/
];
const privatePatterns = [
  /\/home\/(?!example\b|user\b)[^/"'\s]+/i,
  /\/mnt\/c\/Users\/[^/"'\s]+/i,
  /C:\\Users\\[^\\/"'\s]+/i,
  /\/Users\/(?!example\b|user\b)[^/"'\s]+/i,
  /sk-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9_]{20,}/
];

const errors = [];
const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
const pack = JSON.parse(output)[0];
const entries = new Set((pack?.files ?? []).map((file) => file.path));

for (const path of requiredEntries) {
  if (!entries.has(path)) errors.push(`package artifact missing required public entry: ${path}`);
}

for (const path of entries) {
  if (forbiddenPatterns.some((pattern) => pattern.test(path))) errors.push(`package artifact includes private/generated entry: ${path}`);
  for (const pattern of privatePatterns) {
    if (pattern.test(path)) errors.push(`package artifact path contains private-looking pattern: ${path}`);
  }
}

if (errors.length) {
  console.error(`Cognopticon package artifact validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Cognopticon package artifact valid: ${entries.size} entries, ${pack.size} bytes.`);
