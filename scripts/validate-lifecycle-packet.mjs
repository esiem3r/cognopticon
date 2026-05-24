#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { releaseGateCommands } from "./verification-gates.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(join(tmpdir(), "cognopticon-lifecycle-packet-"));
const packetArg = argValue("--packet");
const completeResearch = process.argv.includes("--complete-research");
const errors = [];

try {
  const runDir = packetArg ? packetRunDir(packetArg) : generateDefaultPacket();
  const run = validatePacket(runDir, { completeResearch, expectDefaults: !packetArg });
  const artifacts = run.artifacts ?? {};

  if (errors.length) {
    console.error(`Cognopticon lifecycle packet validation failed with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`Cognopticon lifecycle packet valid: ${Object.keys(artifacts).length} artifacts, structured research loop, bounded handoff${completeResearch ? ", completed research evidence" : ""}.`);
} finally {
  if (!process.env.COGNOPTICON_KEEP_LIFECYCLE_VALIDATION) rmSync(tempRoot, { recursive: true, force: true });
}

function generateDefaultPacket() {
  setupTempRepo();
  const result = spawnSync(process.execPath, [
    "scripts/lifecycle-loop.mjs",
    "--objective",
    "Validate structured lifecycle research loop",
    "--scope",
    "scripts/lifecycle-loop.mjs,docs/lifecycle-harness.md"
  ], {
    cwd: tempRoot,
    encoding: "utf8",
    env: minimalChildEnv()
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`lifecycle packet generation failed with exit code ${result.status}`);
  }

  const match = result.stdout.match(/Created Cognopticon lifecycle packet: (.+)\s*$/m);
  if (!match) throw new Error("lifecycle packet generator did not report an output directory");
  return match[1].trim();
}

function validatePacket(runDir, options = {}) {
  const run = readJson(join(runDir, "run.json"));
  const artifacts = run.artifacts ?? {};
  const requiredArtifacts = [
    "supervisor",
    "researcher",
    "researchBrief",
    "planner",
    "mission",
    "reviewer",
    "verifier",
    "uxAuditor",
    "integrator",
    "handoff",
    "finalReport"
  ];

  if (options.expectDefaults) {
    requireEqual(run.researchRequired, true, "research should be required by default");
    requireEqual(run.uxRequired, true, "UX audit should be required by default");
  }
  if (run.researchRequired) requireIncludes(run.phaseOrder, "research_brief", "phase order should include research_brief when research is required");
  if (run.uxRequired) requireIncludes(run.phaseOrder, "ux_auditor", "phase order should include ux_auditor when UX audit is required");
  requireIncludes(run.phaseOrder, "handoff", "phase order should include handoff");
  requireIncludes(run.phaseOrder, "final_report", "phase order should include final_report");
  for (const gate of releaseGateCommands) requireIncludes(run.gates, gate, `packet gates should include release gate: ${gate}`);
  requireIncludes(run.gates, "npm run validate:lifecycle", "packet gates should include lifecycle validation");

  for (const key of requiredArtifacts) {
    if (!artifacts[key]) errors.push(`run.json missing artifact key: ${key}`);
    else if (!existsSync(artifacts[key])) errors.push(`artifact missing on disk: ${key}`);
  }

  requireText(
    artifacts.supervisor,
    run.researchRequired
      ? ["Packet Order", "`research-brief.md` plan-lock evidence", "Required Evidence Trail", "handoff.md"]
      : ["Packet Order", "Research disabled for this packet; record why.", "Required Evidence Trail", "handoff.md"]
  );
  requireText(artifacts.researcher, ["Write findings into:", "links and retrieval dates", "License and compatibility", "Maintenance signals", "Rejection rationale", "network research"]);
  requireText(artifacts.researchBrief, ["Source Matrix", "Retrieved", "License Gate", "Fit For Cognopticon", "Recommendation To Planner", "Open questions before plan lock"]);
  requireText(
    artifacts.planner,
    run.researchRequired
      ? ["Do not lock the plan", "npm run validate:lifecycle -- --packet", "research-brief.md", "Explicit prior-art decision"]
      : ["Research was disabled", "record the reason", "Explicit prior-art decision"]
  );
  requireText(artifacts.mission, ["Read `research-brief.md`", "Prior-art sources used", "reuse/license decisions"]);
  requireText(artifacts.reviewer, ["privacy leaks", "shallow prior-art use", "file/line references"]);
  requireText(artifacts.verifier, ["Gates", "exact outcomes"]);
  requireText(artifacts.uxAuditor, ["real browser", "Screenshots or exact screenshot paths"]);
  requireText(artifacts.integrator, ["research-brief.md", "Prior-art/license decisions", "accept, revise, or reject"]);
  requireText(
    artifacts.handoff,
    run.researchRequired
      ? ["Second Codex Terminal Handoff", "Suggested Prompt", "mission.md", "research-brief.md", "Do not edit `.cognopticon/` private state", "Stop Conditions"]
      : ["Second Codex Terminal Handoff", "Suggested Prompt", "mission.md", "Do not edit `.cognopticon/` private state", "Stop Conditions"]
  );
  requireText(artifacts.finalReport, ["Prior Art", "Sources:", "License/reuse decision:", "How research changed the plan:", "Integration Decision"]);

  if (options.completeResearch) {
    if (!run.researchRequired) errors.push("--complete-research cannot pass when packet researchRequired is false");
    for (const issue of completedResearchIssues(readText(artifacts.researchBrief))) errors.push(issue);
  } else if (run.researchRequired) {
    const blankTemplateIssues = completedResearchIssues(readText(artifacts.researchBrief));
    if (!blankTemplateIssues.length) errors.push("default research brief template unexpectedly satisfies completed research validation");
    const completeFixtureIssues = completedResearchIssues(completedResearchFixture());
    if (completeFixtureIssues.length) errors.push(`completed research fixture should pass validation: ${completeFixtureIssues.join("; ")}`);
  }

  return run;
}

function setupTempRepo() {
  cpSync(join(repoRoot, "scripts"), join(tempRoot, "scripts"), { recursive: true });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readText(path) {
  if (!path || !existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

function requireText(path, snippets) {
  if (!path || !existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const snippet of snippets) {
    if (!text.includes(snippet)) errors.push(`${path} must mention ${snippet}`);
  }
}

function requireEqual(actual, expected, message) {
  if (actual !== expected) errors.push(`${message} (expected ${String(expected)}, got ${String(actual)})`);
}

function requireIncludes(values, expected, message) {
  if (!Array.isArray(values) || !values.includes(expected)) errors.push(message);
}

function completedResearchIssues(text) {
  const issues = [];
  if (!/- \[[xX]\] complete/.test(text)) issues.push("research-brief.md must check `[x] complete` before plan lock");
  if (/- \[[xX]\] blocked/.test(text)) issues.push("research-brief.md cannot be both complete and blocked");
  if (/- \[[xX]\] skipped with explicit supervisor approval/.test(text)) issues.push("research-brief.md cannot be both complete and skipped");
  if (/\|\s*\|\s*\|\s*\|\s*\|\s*\|\s*\|\s*\|/.test(text)) issues.push("research-brief.md source matrix still contains an empty placeholder row");
  const rows = sourceRows(text);
  if (!rows.some((row) => {
    const [source, url, retrieved, license, maintenance, usefulIdea, reuseDecision] = row;
    return source && /^https?:\/\//.test(url) && /^\d{4}-\d{2}-\d{2}$/.test(retrieved) && license && maintenance && usefulIdea && reuseDecision;
  })) {
    issues.push("research-brief.md must include at least one source row with URL, YYYY-MM-DD retrieval date, license, maintenance signal, useful idea, and reuse decision");
  }
  for (const label of [
    "Dependencies or copied snippets approved",
    "Sources rejected because of license/provenance",
    "Attribution needed in code/docs",
    "Local-first/private-profile implications",
    "Daemon authority implications",
    "Public demo implications",
    "Frontend/UX implications",
    "Reuse",
    "Avoid",
    "Open questions before plan lock"
  ]) {
    if (!lineHasValue(text, label)) issues.push(`research-brief.md must fill: ${label}`);
  }
  return issues;
}

function sourceRows(text) {
  const section = sectionText(text, "## Source Matrix");
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .filter((line) => !/^\|\s*-+/.test(line))
    .filter((line) => !line.includes("| Source | URL |"))
    .map((line) => line.slice(1, -1).split("|").map((cell) => cell.trim()));
}

function sectionText(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return "";
  const next = text.indexOf("\n## ", start + heading.length);
  return next < 0 ? text.slice(start) : text.slice(start, next);
}

function lineHasValue(text, label) {
  const pattern = new RegExp(`^- ${escapeRegExp(label)}:[ \\t]*(\\S.*)$`, "m");
  return pattern.test(text);
}

function packetRunDir(value) {
  const resolved = resolve(value);
  return resolved.endsWith("run.json") ? dirname(resolved) : resolved;
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function completedResearchFixture() {
  return [
    "# Cognopticon Research Brief",
    "",
    "## Research Status",
    "- [x] complete",
    "- [ ] blocked",
    "- [ ] skipped with explicit supervisor approval",
    "",
    "## Source Matrix",
    "| Source | URL | Retrieved | License | Maintenance signal | Useful idea | Reuse decision |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    "| LangGraph | https://langchain-ai.github.io/langgraph/ | 2026-05-24 | MIT | Active docs and releases | State-graph workflow pattern | Borrow pattern, no code copied |",
    "",
    "## License Gate",
    "- Dependencies or copied snippets approved: None.",
    "- Sources rejected because of license/provenance: None.",
    "- Attribution needed in code/docs: Link prior-art source in report.",
    "",
    "## Fit For Cognopticon",
    "- Local-first/private-profile implications: Keep packet artifacts private.",
    "- Daemon authority implications: Do not expand daemon capabilities.",
    "- Public demo implications: No private state in public assets.",
    "- Frontend/UX implications: No UI touched.",
    "",
    "## Recommendation To Planner",
    "- Reuse: Borrow the explicit state-gate pattern.",
    "- Avoid: Vendoring external code.",
    "- Open questions before plan lock: None."
  ].join("\n");
}

function minimalChildEnv() {
  const env = {};
  for (const name of ["PATH", "Path", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT"]) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return {
    ...env,
    HOME: tempRoot,
    USERPROFILE: tempRoot,
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    CI: process.env.CI ?? "1",
    FORCE_COLOR: "0"
  };
}
