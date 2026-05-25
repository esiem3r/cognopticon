#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { execFileSync } from "node:child_process";
import { releasePrivacyFindings } from "./release-privacy-rules.mjs";
import { releaseGateCommands } from "./verification-gates.mjs";

const errors = [];
const forbiddenTracked = [
  /^\.cognopticon\//,
  /^_cognopticon_safety\//,
  /^dist\//,
  /^dist-pages\//,
  /^node_modules\//,
  /^playwright-report\//,
  /^test-results\//,
  /^public\/workspace\.json$/,
  /^src\/data\/demo-workspace\.json$/,
  /^missions\//,
  /^workspace-scan\.json$/,
  /^\.env(?:\.|$)/
];
const requiredPublicSurfaces = [
  ".github/workflows/check.yml",
  ".github/workflows/pages.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/support_request.yml",
  ".github/ISSUE_TEMPLATE/security_coordination.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".npmignore",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "docs/getting-started.md",
  "docs/release-checklist.md",
  "src/data/workspace-meta.json",
  "src/data/projects.json",
  "src/data/relationships.json",
  "src/data/workspace-roots.json"
];
const releaseSourcePrefixes = ["daemon/", "docs/", "scripts/", "src/", "tests/"];
const generatedDemoArtifact = "src/data/demo-workspace.json";
const generatedDemoReferenceAllowlist = new Set([".gitignore", ".npmignore", "scripts/sanitize-demo-workspace.mjs", "scripts/validate-release-hygiene.mjs"]);
const checkCommand = "node scripts/run-check.mjs";
const textExtensions = new Set([".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".ts", ".tsx", ".txt", ".yml", ".yaml"]);
const textBasenames = new Set([".gitignore", ".npmignore", "LICENSE", "package.json", "tsconfig.json"]);

const trackedFiles = gitFiles(["ls-files"]);
const untrackedFiles = gitFiles(["ls-files", "--others", "--exclude-standard"]);

for (const path of trackedFiles) {
  if (existsSync(path) && forbiddenTracked.some((pattern) => pattern.test(path))) errors.push(`tracked private/generated path is forbidden: ${path}`);
}

if (existsSync("public/workspace.json")) errors.push("public/workspace.json exists and would be copied into the public build");

for (const path of untrackedFiles) {
  if (path === "public/workspace.json") errors.push("public/workspace.json exists as untracked generated local data");
  if (path.startsWith(".cognopticon/")) errors.push(`.cognopticon state must remain untracked and private: ${path}`);
  if (path.startsWith("_cognopticon_safety/")) errors.push(`safety baseline inventory is local-only and must not be released: ${path}`);
  if (requiredPublicSurfaces.includes(path)) errors.push(`required public release surface is untracked and can be omitted from a release commit: ${path}`);
  if (isReleaseSourcePath(path) && isPublicTextPath(path)) errors.push(`public release source is untracked and can be omitted from a release commit: ${path}`);
}

for (const path of requiredPublicSurfaces) {
  if (!existsSync(path)) errors.push(`required public surface is missing: ${path}`);
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (packageJson.license !== "MIT") errors.push("package.json license must be MIT for the public open-source release");
if (packageJson.private !== true) errors.push("package.json must remain private to prevent accidental npm-registry publication");
if (packageJson.engines?.node !== ">=22") errors.push("package.json engines.node must declare >=22");
if (packageJson.engines?.npm !== ">=10") errors.push("package.json engines.npm must declare >=10");
if (packageJson.scripts?.["dev:demo"] !== "vite --host 127.0.0.1 --mode pages") errors.push("package.json dev:demo script must run Vite in static public-demo mode");
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
if (packageLock.packages?.[""]?.license !== packageJson.license) errors.push("package-lock.json root license must match package.json");
if (packageLock.packages?.[""]?.engines?.node !== packageJson.engines.node) errors.push("package-lock.json root engines.node must match package.json");
if (packageLock.packages?.[""]?.engines?.npm !== packageJson.engines.npm) errors.push("package-lock.json root engines.npm must match package.json");
if (packageJson.scripts?.check !== checkCommand) errors.push(`package.json check script must delegate to ${checkCommand}`);
const licenseText = existsSync("LICENSE") ? readFileSync("LICENSE", "utf8") : "";
if (!licenseText.startsWith("MIT License") || !licenseText.includes("Cognopticon contributors")) errors.push("LICENSE must contain the public MIT license grant");
const securityText = existsSync("SECURITY.md") ? readFileSync("SECURITY.md", "utf8") : "";
for (const required of [".cognopticon/", "daemon token", "127.0.0.1", "npm run validate:release"]) {
  if (!securityText.includes(required)) errors.push(`SECURITY.md must mention ${required}`);
}
for (const [path, heading] of [["README.md", "## Final Verification"], ["docs/lifecycle-harness.md", "Default gates:"]]) {
  const text = existsSync(path) ? sectionText(readFileSync(path, "utf8"), heading) : "";
  for (const gate of releaseGateCommands) {
    if (!text.includes(gate)) errors.push(`${path} ${heading} must mention release gate: ${gate}`);
  }
}
const readmeText = existsSync("README.md") ? readFileSync("README.md", "utf8") : "";
for (const required of ["Node.js 22 or newer", "npm 10 or newer", "package.json", "private", "npm-registry publication"]) {
  if (!readmeText.includes(required)) errors.push(`README.md must mention install metadata: ${required}`);
}
for (const required of ["docs/getting-started.md", "Public demo", "Local runtime", "npm run dev:demo", "npm run release:checkpoint -- --remote", "npm run check"]) {
  if (!readmeText.includes(required)) errors.push(`README.md must mention fresh-user onboarding: ${required}`);
}
const gettingStartedText = existsSync("docs/getting-started.md") ? readFileSync("docs/getting-started.md", "utf8") : "";
for (const required of ["Public demo", "Local runtime", "Codex process loop", "npm run dev:demo", "static public-demo mode", "does not probe the local daemon", "terminal-verifier", "terminal-builder", "outside daemon dispatch", "sanitized fixtures", ".cognopticon/profiles/<profile>/", "127.0.0.1", "allowlisted commands", "public/workspace.json", "npm run validate:daemon-config", "SECURITY.md", "SUPPORT.md"]) {
  if (!gettingStartedText.includes(required)) errors.push(`docs/getting-started.md must mention fresh-user boundary: ${required}`);
}
const releaseChecklistText = existsSync("docs/release-checklist.md") ? readFileSync("docs/release-checklist.md", "utf8") : "";
for (const required of ["docs/getting-started.md", "Node.js/npm install floor", "package.json", "private", "npm-registry publication"]) {
  if (!releaseChecklistText.includes(required)) errors.push(`docs/release-checklist.md must mention install metadata: ${required}`);
}
const workflowText = existsSync(".github/workflows/check.yml") ? readFileSync(".github/workflows/check.yml", "utf8") : "";
for (const required of ["permissions:", "contents: read", "actions/checkout@v6", "actions/setup-node@v6", "node-version: 22", "npm ci", "npx playwright install --with-deps chromium", "npm run check"]) {
  if (!workflowText.includes(required)) errors.push(`.github/workflows/check.yml must mention ${required}`);
}
const pagesWorkflowText = existsSync(".github/workflows/pages.yml") ? readFileSync(".github/workflows/pages.yml", "utf8") : "";
for (const required of [
  "Public Demo Pages",
  "pull_request:",
  "workflow_dispatch:",
  "permissions:",
  "contents: read",
  "pages: write",
  "id-token: write",
  "github-pages",
  "actions/checkout@v6",
  "actions/setup-node@v6",
  "npx playwright install --with-deps chromium",
  "actions/configure-pages@v6",
  "actions/upload-pages-artifact@v5",
  "actions/deploy-pages@v5",
  "npm run check",
  "path: dist-pages"
]) {
  if (!pagesWorkflowText.includes(required)) errors.push(`.github/workflows/pages.yml must mention ${required}`);
}

for (const path of releaseScanFiles([...trackedFiles, ...untrackedFiles, ...requiredPublicSurfaces])) {
  if (!existsSync(path)) continue;
  const text = readFileSync(path, "utf8");
  if (text.includes(generatedDemoArtifact) && !generatedDemoReferenceAllowlist.has(path)) {
    errors.push(`${path} references generated local artifact ${generatedDemoArtifact}; public runtime must use split fixtures`);
  }
  for (const finding of releasePrivacyFindings(text)) {
    errors.push(`${path} contains private or secret-looking release hygiene pattern: ${finding.label}`);
  }
}

const demoMetadata = JSON.parse(readFileSync("src/data/workspace-meta.json", "utf8"));
const demoProjects = JSON.parse(readFileSync("src/data/projects.json", "utf8"));
const demoRoots = JSON.parse(readFileSync("src/data/workspace-roots.json", "utf8"));
if (demoMetadata.title !== "Cognopticon Demo Workspace" || demoMetadata.analysis?.source !== "sample") errors.push("demo metadata must describe the sanitized public sample workspace");
if (!Array.isArray(demoRoots) || !demoRoots.every((root) => root.startsWith("/demo/"))) errors.push("demo roots must all use /demo/");
if (!Array.isArray(demoProjects) || !demoProjects.every((project) => typeof project.path === "string" && project.path.startsWith("/demo/"))) {
  errors.push("demo project paths must all use /demo/");
}

if (errors.length) {
  console.error(`Cognopticon release hygiene failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Cognopticon release hygiene valid: public surfaces are sanitized and generated local state is not tracked.");

function gitFiles(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function releaseScanFiles(paths) {
  const seen = new Set();
  return paths
    .filter((path) => {
      if (seen.has(path) || !isPublicTextPath(path)) return false;
      seen.add(path);
      return true;
    })
    .sort();
}

function isPublicTextPath(path) {
  if (!path || path.startsWith(".cognopticon/") || path.startsWith("node_modules/") || path.startsWith("dist/") || path.startsWith("dist-pages/")) return false;
  if (path.startsWith("test-results/") || path.startsWith("playwright-report/") || path.startsWith("_cognopticon_safety/")) return false;
  if (textBasenames.has(path)) return true;
  return textExtensions.has(extname(path));
}

function isReleaseSourcePath(path) {
  return releaseSourcePrefixes.some((prefix) => path.startsWith(prefix));
}

function sectionText(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return "";
  const nextHeading = text.indexOf("\n## ", start + heading.length);
  return nextHeading < 0 ? text.slice(start) : text.slice(start, nextHeading);
}
