#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const errors = [];
const requiredFiles = [
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SUPPORT.md",
  "docs/release-checklist.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/support_request.yml",
  ".github/ISSUE_TEMPLATE/security_coordination.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/PULL_REQUEST_TEMPLATE.md"
];

for (const path of requiredFiles) {
  if (!existsSync(path)) errors.push(`missing community health file: ${path}`);
}

requireText("README.md", [
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SUPPORT.md",
  "docs/release-checklist.md"
]);
requireText("CONTRIBUTING.md", [".cognopticon/", "daemon tokens", "private paths", "generated local workspace JSON", "private screenshots", "npm run check", "SECURITY.md"]);
requireText("CODE_OF_CONDUCT.md", ["private workspace data", "daemon tokens", "vulnerability details", "SUPPORT.md", "SECURITY.md"]);
requireText("SUPPORT.md", [".cognopticon/", "daemon tokens", "private paths", "generated local workspace JSON", "screenshots", "SECURITY.md"]);
requireText("docs/release-checklist.md", ["npm run check", "npm run validate:community", "npm run build:pages", "npm run validate:pages", "npm run validate:daemon", "npm run validate:daemon-config", "GitHub Pages", "public/workspace.json", "SECURITY.md", "SUPPORT.md", "independent reviewer"]);
requireText(".github/ISSUE_TEMPLATE/bug_report.yml", [".cognopticon/", "daemon tokens", "private paths", "SECURITY.md", "private vulnerability reporting", "security coordination"]);
requireText(".github/ISSUE_TEMPLATE/feature_request.yml", [".cognopticon/", "daemon tokens", "generated local workspace data", "private screenshots", "daemon-authority"]);
requireText(".github/ISSUE_TEMPLATE/support_request.yml", ["SUPPORT.md", ".cognopticon/", "daemon tokens", "private paths", "generated local workspace data", "private screenshots"]);
requireText(".github/ISSUE_TEMPLATE/security_coordination.yml", ["SECURITY.md", "Do not include vulnerability details", "private vulnerability reporting", "minimal public issue", "daemon tokens", ".cognopticon/"]);
requireText(".github/ISSUE_TEMPLATE/config.yml", ["blank_issues_enabled: false"]);
requireText(".github/PULL_REQUEST_TEMPLATE.md", ["npm run check", ".cognopticon/", "daemon tokens", "generated local workspace JSON", "private logs", "/demo/", "shell: false"]);

if (errors.length) {
  console.error(`Cognopticon community health validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Cognopticon community health valid: ${requiredFiles.length} required surfaces.`);

function requireText(path, snippets) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const snippet of snippets) {
    if (!text.includes(snippet)) errors.push(`${path} must mention ${snippet}`);
  }
}
