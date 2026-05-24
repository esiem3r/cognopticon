#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const repo = argValue("--repo") ?? repoFromOrigin();
const branch = argValue("--branch") ?? "main";
const errors = [];
const expectedTopics = [
  "agentic-workflows",
  "codex",
  "developer-tools",
  "knowledge-graph",
  "local-first",
  "playwright",
  "react",
  "threejs",
  "vite"
];
const requiredStatusContext = "Validate, Test, Build, And Audit";
const requiredPagesStatusContext = "Build Sanitized Pages Demo";
const expectedPagesUrl = `https://${repo?.split("/")[0]}.github.io/${repo?.split("/")[1]}/`;

if (!repo) {
  console.error("Cognopticon GitHub repo validation failed: pass --repo owner/name or configure a GitHub origin remote.");
  process.exit(1);
}

const repository = apiJson(`repos/${repo}`);
const topics = apiJson(`repos/${repo}/topics`, ["-H", "Accept: application/vnd.github+json"]);
const protection = apiJson(`repos/${repo}/branches/${branch}/protection`, [], { optional: true });
const privateVulnerabilityReporting = apiJson(`repos/${repo}/private-vulnerability-reporting`, [], { optional: true });
const automatedSecurityFixes = apiJson(`repos/${repo}/automated-security-fixes`, [], { optional: true });
const codeScanning = apiJson(`repos/${repo}/code-scanning/default-setup`, [], { optional: true });
const pages = apiJson(`repos/${repo}/pages`, [], { optional: true });
const vulnerabilityAlertsEnabled = apiStatus(`repos/${repo}/vulnerability-alerts`);

requireEqual(repository.private, false, "repository must be public");
requireEqual(repository.archived, false, "repository must not be archived");
requireEqual(repository.has_issues, true, "Issues must be enabled");
requireEqual(repository.has_projects, false, "Projects must be disabled until they are intentionally maintained");
requireEqual(repository.has_wiki, false, "Wiki must be disabled; docs live in the repository");
requireEqual(repository.delete_branch_on_merge, true, "delete branch on merge must be enabled");
requireEqual(repository.allow_merge_commit, false, "merge commits must be disabled for a readable release history");
requireEqual(repository.allow_squash_merge, true, "squash merge must be enabled");
requireEqual(repository.allow_rebase_merge, true, "rebase merge must be enabled");

const topicNames = new Set(topics?.names ?? []);
for (const topic of expectedTopics) {
  if (!topicNames.has(topic)) errors.push(`missing repository topic: ${topic}`);
}

if (!protection) {
  errors.push(`${branch} must have branch protection enabled`);
} else {
  const checks = new Set([
    ...(protection.required_status_checks?.contexts ?? []),
    ...(protection.required_status_checks?.checks ?? []).map((check) => check.context)
  ].filter(Boolean));
  if (!checks.has(requiredStatusContext)) errors.push(`${branch} protection must require status check: ${requiredStatusContext}`);
  if (!checks.has(requiredPagesStatusContext)) errors.push(`${branch} protection must require status check: ${requiredPagesStatusContext}`);
  requireEqual(protection.enforce_admins?.enabled, true, `${branch} protection must apply to administrators`);
  requireEqual(protection.required_status_checks?.strict, true, `${branch} protection must require branches to be up to date`);
  requireEqual(protection.required_conversation_resolution?.enabled, true, `${branch} protection must require conversation resolution`);
  requireEqual(protection.allow_force_pushes?.enabled, false, `${branch} protection must block force pushes`);
  requireEqual(protection.allow_deletions?.enabled, false, `${branch} protection must block branch deletion`);
}

if (!vulnerabilityAlertsEnabled) errors.push("Dependabot vulnerability alerts must be enabled");
requireEqual(automatedSecurityFixes?.enabled, true, "Dependabot automated security fixes must be enabled");
requireEqual(privateVulnerabilityReporting?.enabled, true, "private vulnerability reporting must be enabled");
requireEqual(codeScanning?.state, "configured", "CodeQL default setup must be configured");
if (!pages) {
  errors.push("GitHub Pages site must be configured");
} else {
  requireEqual(pages.build_type, "workflow", "GitHub Pages must use the Actions workflow source");
  requireEqual(pages.public, true, "GitHub Pages site must be public");
  requireEqual(pages.https_enforced, true, "GitHub Pages must enforce HTTPS");
  if (normalizeUrl(pages.html_url) !== normalizeUrl(expectedPagesUrl)) {
    errors.push(`GitHub Pages URL must be ${expectedPagesUrl} (got ${pages.html_url ?? "missing"})`);
  }
}

if (errors.length) {
  console.error(`Cognopticon GitHub repo validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Cognopticon GitHub repo valid: ${repo} ${branch}, protected release gate, Pages workflow publishing, security reporting, dependency alerts, CodeQL, topics, and repo hygiene.`);

function argValue(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function repoFromOrigin() {
  try {
    const origin = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
    const match = origin.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function apiJson(path, extraArgs = [], options = {}) {
  try {
    const output = execFileSync("gh", ["api", path, ...extraArgs], { encoding: "utf8", stdio: ["ignore", "pipe", options.optional ? "ignore" : "pipe"] });
    return output.trim() ? JSON.parse(output) : {};
  } catch (error) {
    if (options.optional) return undefined;
    throw error;
  }
}

function apiStatus(path) {
  try {
    execFileSync("gh", ["api", path], { encoding: "utf8", stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function requireEqual(actual, expected, message) {
  if (actual !== expected) errors.push(`${message} (expected ${String(expected)}, got ${String(actual)})`);
}

function normalizeUrl(url) {
  return String(url ?? "").replace(/\/+$/, "");
}
