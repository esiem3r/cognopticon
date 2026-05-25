#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { releasePrivacyFindings } from "./release-privacy-rules.mjs";

const distRoot = "dist-pages";
const deployBase = "/cognopticon/";
const errors = [];
const textExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".txt", ".webmanifest", ".xml"]);
const forbiddenStaticDemoSnippets = [
  "127.0.0.1:8787",
  "localhost:8787",
  "/api/workspace",
  "/api/health",
  "/api/events",
  "/api/jobs",
  "/api/actions/",
  "/api/orchestrator",
  "X-Cognopticon-Token",
  "daemonToken"
];
let textFilesScanned = 0;

if (!existsSync(join(distRoot, "index.html"))) {
  console.error("Cognopticon Pages demo validation failed: dist-pages/index.html is missing; run npm run build:pages first.");
  process.exit(1);
}

const indexHtml = readFileSync(join(distRoot, "index.html"), "utf8");
if (!indexHtml.includes("Cognopticon")) errors.push("dist-pages/index.html must identify Cognopticon");

const assetRefs = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((path) => path.includes("/assets/"));

if (assetRefs.length < 2) errors.push("dist-pages/index.html must reference built JS and CSS assets");
for (const ref of assetRefs) {
  if (!ref.startsWith(`${deployBase}assets/`)) {
    errors.push(`Pages asset reference must use project base ${deployBase}: ${ref}`);
    continue;
  }
  const assetPath = join(distRoot, ref.slice(deployBase.length));
  if (!existsSync(assetPath)) errors.push(`Pages asset reference is missing from dist-pages: ${ref}`);
  else if (statSync(assetPath).size < 100) errors.push(`Pages asset is suspiciously small: ${ref}`);
}

for (const file of walk(distRoot)) {
  const path = relative(distRoot, file).replace(/\\/g, "/");
  if (path === "workspace.json" || path.endsWith("/workspace.json")) errors.push(`Pages artifact must not include generated workspace JSON: ${path}`);
  if (path.startsWith(".cognopticon/")) errors.push(`Pages artifact must not include private state: ${path}`);
  if (!isTextPath(path)) continue;
  textFilesScanned += 1;
  const text = readFileSync(file, "utf8");
  if (text.includes("public/workspace.json")) errors.push(`${path} references public/workspace.json`);
  if (text.includes(".cognopticon/profiles")) errors.push(`${path} references private profile state`);
  for (const snippet of forbiddenStaticDemoSnippets) {
    if (text.includes(snippet)) errors.push(`${path} references local-runtime API surface forbidden in the public static demo: ${snippet}`);
  }
  for (const finding of releasePrivacyFindings(text)) {
    errors.push(`${path} contains private or secret-looking Pages artifact pattern: ${finding.label}`);
  }
}

if (errors.length) {
  console.error(`Cognopticon Pages demo validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Cognopticon Pages demo valid: ${assetRefs.length} project-base asset reference(s), ${textFilesScanned} text artifact(s) scanned.`);

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function isTextPath(path) {
  const dot = path.lastIndexOf(".");
  return dot >= 0 && textExtensions.has(path.slice(dot).toLowerCase());
}
