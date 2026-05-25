#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { releasePrivacyFindings } from "./release-privacy-rules.mjs";

const requiredEntries = [
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "docs/getting-started.md",
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
  /^dist-pages\//,
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
const textExtensions = new Set([".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".ts", ".tsx", ".txt", ".yml", ".yaml"]);
const textBasenames = new Set([".gitignore", ".npmignore", "LICENSE", "package.json", "tsconfig.json"]);

const errors = [];
const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
const pack = JSON.parse(output)[0];
const entries = new Set((pack?.files ?? []).map((file) => file.path));
let contentScanned = 0;

for (const path of requiredEntries) {
  if (!entries.has(path)) errors.push(`package artifact missing required public entry: ${path}`);
}

for (const path of entries) {
  if (forbiddenPatterns.some((pattern) => pattern.test(path))) errors.push(`package artifact includes private/generated entry: ${path}`);
  for (const finding of releasePrivacyFindings(path)) {
    errors.push(`package artifact path contains ${finding.label}: ${path}`);
  }
  if (isPublicTextPath(path)) {
    if (!existsSync(path)) {
      errors.push(`package artifact text entry is missing from the working tree: ${path}`);
      continue;
    }
    contentScanned += 1;
    const text = readFileSync(path, "utf8");
    for (const finding of releasePrivacyFindings(text)) {
      errors.push(`package artifact content contains ${finding.label}: ${path}`);
    }
  }
}

if (errors.length) {
  console.error(`Cognopticon package artifact validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Cognopticon package artifact valid: ${entries.size} entries, ${pack.size} bytes, ${contentScanned} text entries scanned.`);

function isPublicTextPath(path) {
  if (textBasenames.has(path)) return true;
  return textExtensions.has(extname(path));
}
