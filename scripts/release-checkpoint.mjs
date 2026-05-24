#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isReleasePayloadPath } from "./release-paths.mjs";

const remote = process.argv.includes("--remote");
const errors = [];
const staged = gitFiles(["diff", "--cached", "--name-only"]);
const unstaged = gitFiles(["diff", "--name-only"]);
const untracked = gitFiles(["ls-files", "--others", "--exclude-standard"]);
const tracked = gitFiles(["ls-files"]);
const stagedReleaseFiles = staged.filter(isReleasePayloadPath);
const unstagedReleaseFiles = unstaged.filter(isReleasePayloadPath);
const untrackedReleaseFiles = untracked.filter(isReleasePayloadPath);
const trackedReleaseFiles = tracked.filter(isReleasePayloadPath);
const releaseMode = stagedReleaseFiles.length ? "staged payload" : "clean committed tree";
const checkpointReleaseFiles = stagedReleaseFiles.length ? stagedReleaseFiles : trackedReleaseFiles;
const pack = npmPack();
const workflowActions = parseWorkflowActions(".github/workflows/check.yml");
const actionResults = remote ? verifyActionTags(workflowActions) : workflowActions.map((action) => ({ ...action, status: "not checked" }));

if (!existsSync(".git")) errors.push("release checkpoint requires a git checkout");
if (!checkpointReleaseFiles.length) errors.push("release checkpoint requires release payload files");
for (const path of unstagedReleaseFiles) errors.push(`unstaged release payload file: ${path}`);
for (const path of untrackedReleaseFiles) errors.push(`untracked release payload file: ${path}`);
if (!pack) errors.push("npm pack dry-run did not return a package artifact");
if (!workflowActions.length) errors.push(".github/workflows/check.yml does not declare reusable actions");
for (const result of actionResults) {
  if (result.status === "missing") errors.push(`workflow action tag not found remotely: ${result.ownerRepo}@${result.ref}`);
  if (result.status === "error") errors.push(`workflow action tag check failed: ${result.ownerRepo}@${result.ref} (${result.error})`);
}

if (errors.length) {
  console.error(`Cognopticon release checkpoint failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Cognopticon release checkpoint ready:");
console.log(`- release mode: ${releaseMode}`);
console.log(`- release files: ${checkpointReleaseFiles.length}`);
console.log(`- staged release files: ${stagedReleaseFiles.length}`);
console.log(`- unstaged release files: ${unstagedReleaseFiles.length}`);
console.log(`- untracked release files: ${untrackedReleaseFiles.length}`);
if (pack) console.log(`- package artifact: ${pack.files?.length ?? 0} entries, ${pack.size} bytes`);
console.log(`- workflow actions: ${formatActionResults(actionResults)}`);
console.log("- required final gate: npm run check");

function gitFiles(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function npmPack() {
  try {
    return JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" }))[0];
  } catch {
    return null;
  }
}

function parseWorkflowActions(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const actions = [];
  const pattern = /^\s*uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([A-Za-z0-9_.-]+)\s*$/gm;
  for (const match of text.matchAll(pattern)) {
    actions.push({ ownerRepo: match[1], ref: match[2] });
  }
  return actions;
}

function verifyActionTags(actions) {
  return actions.map((action) => {
    try {
      const output = execFileSync("git", ["ls-remote", "--tags", `https://github.com/${action.ownerRepo}.git`, `refs/tags/${action.ref}`], {
        encoding: "utf8",
        timeout: 15000
      });
      return { ...action, status: output.trim() ? "ok" : "missing" };
    } catch (error) {
      return { ...action, status: "error", error: error instanceof Error ? error.message : String(error) };
    }
  });
}

function formatActionResults(results) {
  return results.map((result) => `${result.ownerRepo}@${result.ref} ${result.status}`).join(", ");
}
