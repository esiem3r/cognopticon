#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isReleasePayloadPath } from "./release-paths.mjs";

const errors = [];
const staged = gitFiles(["diff", "--cached", "--name-only"]);
const unstaged = gitFiles(["diff", "--name-only"]);
const untracked = gitFiles(["ls-files", "--others", "--exclude-standard"]);
const stagedReleaseFiles = staged.filter(isReleasePayloadPath);
const unstagedReleaseFiles = unstaged.filter(isReleasePayloadPath);
const untrackedReleaseFiles = untracked.filter(isReleasePayloadPath);

if (!existsSync(".git")) {
  console.log("Cognopticon release payload validation skipped: not a git checkout.");
  process.exit(0);
}

if (stagedReleaseFiles.length) {
  for (const path of unstagedReleaseFiles) {
    errors.push(`release payload has unstaged public-source change: ${path}`);
  }
  for (const path of untrackedReleaseFiles) {
    errors.push(`release payload has untracked public-source file: ${path}`);
  }
}

if (errors.length) {
  console.error(`Cognopticon release payload validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const mode = stagedReleaseFiles.length ? "strict" : "no staged release payload";
console.log(`Cognopticon release payload valid: ${mode}, ${stagedReleaseFiles.length} staged release file(s).`);

function gitFiles(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
