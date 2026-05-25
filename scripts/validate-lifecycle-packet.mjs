#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
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
  if (match) return match[1].trim();
  const generated = findGeneratedRunDir(tempRoot);
  if (generated) return generated;
  throw new Error("lifecycle packet generator did not report an output directory");
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
    "terminalOrchestrator",
    "terminalAgents",
    "handoff",
    "finalReport"
  ];

  if (options.expectDefaults) {
    requireEqual(run.researchRequired, true, "research should be required by default");
    requireEqual(run.uxRequired, true, "UX audit should be required by default");
  }
  if (run.researchRequired) requireIncludes(run.phaseOrder, "research_brief", "phase order should include research_brief when research is required");
  else {
    requireString(run.researchSkipReason, "research-disabled packets must record researchSkipReason");
    requireNotIncludes(run.phaseOrder, "researcher", "phase order should omit researcher when research is disabled");
    requireNotIncludes(run.phaseOrder, "research_brief", "phase order should omit research_brief when research is disabled");
  }
  if (run.uxRequired) requireIncludes(run.phaseOrder, "ux_auditor", "phase order should include ux_auditor when UX audit is required");
  else {
    requireString(run.uxSkipReason, "UX-disabled packets must record uxSkipReason");
    requireNotIncludes(run.phaseOrder, "ux_auditor", "phase order should omit ux_auditor when UX audit is disabled");
  }
  requireIncludes(run.phaseOrder, "terminal_orchestrator", "phase order should include terminal_orchestrator");
  requirePhaseBefore(run.phaseOrder, "terminal_orchestrator", "reviewer", "terminal_orchestrator should precede reviewer in phase order");
  requirePhaseBefore(run.phaseOrder, "terminal_orchestrator", "verifier", "terminal_orchestrator should precede verifier in phase order");
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
      ? ["Packet Order", "`research-brief.md` plan-lock evidence", "Required Evidence Trail", "terminal-orchestrator.md", "handoff.md"]
      : ["Packet Order", "Research disabled for this packet; reason:", "Required Evidence Trail", "research enabled before plan lock", "terminal-orchestrator.md", "handoff.md"]
  );
  requireText(artifacts.researcher, ["Write findings into:", "links and retrieval dates", "License and compatibility", "Maintenance signals", "Rejection rationale", "network research"]);
  requireText(
    artifacts.researchBrief,
    run.researchRequired
      ? ["Source Matrix", "Retrieved", "License Gate", "Fit For Cognopticon", "Recommendation To Planner", "Open questions before plan lock"]
      : ["[x] skipped with explicit supervisor approval", "Skip Rationale", "Supervisor approval: `--research off`", "No code copied", "Regenerate with research enabled"]
  );
  requireText(
    artifacts.planner,
    run.researchRequired
      ? ["Do not lock the plan", "npm run validate:lifecycle -- --packet", "research-brief.md", "Explicit prior-art decision"]
      : ["Research was disabled", "skip reason:", "Explicit prior-art decision"]
  );
  requireText(artifacts.mission, ["Read `research-brief.md`", "Prior-art status", "reuse/license decisions"]);
  if (run.readOnly === true) requireText(artifacts.mission, ["read-only lifecycle packet", "Do not implement", "without editing tracked files", "follow-up implementation loop"]);
  requireText(artifacts.reviewer, ["privacy leaks", "shallow prior-art use", "file/line references"]);
  requireText(artifacts.verifier, ["Gates", "exact outcomes"]);
  requireText(
    artifacts.uxAuditor,
    run.uxRequired
      ? ["real browser", "Screenshots or exact screenshot paths"]
      : ["UX Audit Status", "[x] skipped with explicit supervisor approval", "Supervisor approval: `--ux off`", "do not accept frontend changes"]
  );
  requireText(artifacts.integrator, ["terminal reports", "accept, revise, or reject"]);
  if (run.researchRequired) requireText(artifacts.integrator, ["research-brief.md", "Prior-art/license decisions"]);
  else requireText(artifacts.integrator, ["Research skip rationale remains valid"]);
  if (!run.uxRequired) requireText(artifacts.integrator, ["UX skip rationale remains valid"]);
  requireText(artifacts.terminalOrchestrator, ["Process-Supervised Codex Terminal Orchestrator", "Product Boundary", "multi_agent_v1.spawn_agent", "Child Contract", "daemon_actions=false", "sandbox_mode"]);
  validateTerminalAgents(artifacts.terminalAgents, run);
  if (options.expectDefaults) validateGeneratedTerminalArtifacts(runDir);
  requireText(
    artifacts.handoff,
    run.researchRequired
      ? ["Second Codex Terminal Handoff", "manual fallback", "Suggested Prompt", "mission.md", "research-brief.md", "Do not edit `.cognopticon/` private state", "Stop Conditions"]
      : ["Second Codex Terminal Handoff", "manual fallback", "Suggested Prompt", "mission.md", "Do not edit `.cognopticon/` private state", "Stop Conditions"]
  );
  requireText(
    artifacts.finalReport,
    run.researchRequired
      ? ["Prior Art", "Sources:", "License/reuse decision:", "How research changed the plan:", "Integration Decision"]
      : ["Prior Art", "Research skipped:", "no external code or assets approved", "Integration Decision"]
  );
  if (!run.uxRequired) requireText(artifacts.finalReport, ["UX audit skipped:", "Frontend acceptance status"]);

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

function validateTerminalAgents(path, run) {
  if (!path || !existsSync(path)) return;
  let manifest;
  try {
    manifest = readJson(path);
  } catch (error) {
    errors.push(`${path} must be valid JSON: ${error.message}`);
    return;
  }
  requireEqual(manifest.mode, "codex_internal_terminal", "terminal-agents.json mode should be codex_internal_terminal");
  requireEqual(manifest.productBoundary?.browserAppDispatchesAgents, false, "terminal manifest should keep browser app dispatch disabled");
  requireEqual(manifest.productBoundary?.daemonDispatchesAgents, false, "terminal manifest should keep daemon dispatch disabled");
  if (run?.readOnly === true) requireEqual(manifest.rootSupervisor?.mayMutateTrackedFiles, false, "read-only terminal manifest should not grant root mutation authority");
  requireEqual(manifest.budget?.maxFreshTerminals, 3, "terminal manifest should cap fresh terminal fanout at 3 by default");
  if (manifest.budget?.maxFreshTerminalsHeavy > manifest.budget?.maxFreshTerminals) {
    errors.push("terminal manifest should not advertise a heavy fresh-terminal ceiling above maxFreshTerminals");
  }
  requireEqual(manifest.budget?.maxDepthInsideTerminal, 2, "terminal manifest should cap child depth at 2");
  if (!Array.isArray(manifest.agents) || manifest.agents.length < 4) {
    errors.push("terminal-agents.json should define researcher, reviewer, verifier, and builder terminal agents");
    return;
  }
  for (const requiredRole of ["researcher", "reviewer", "verifier", "builder"]) {
    if (!manifest.agents.some((agent) => agent.role === requiredRole)) errors.push(`terminal-agents.json missing ${requiredRole} role`);
  }
  for (const agent of manifest.agents) {
    for (const field of ["id", "parentAgentId", "loopId", "role", "objective", "stopCondition", "artifactPath", "promptPath", "sandboxMode"]) {
      if (!agent[field]) errors.push(`terminal agent ${agent.id ?? "(unknown)"} missing ${field}`);
    }
    if (typeof agent.objective === "string" && !agent.objective.includes(manifest.objective)) {
      errors.push(`terminal agent ${agent.id ?? "(unknown)"} objective should include the lifecycle objective`);
    }
    if (!Array.isArray(agent.readScope) || !agent.readScope.length) errors.push(`terminal agent ${agent.id ?? "(unknown)"} must have readScope`);
    for (const scope of ["README.md", "CONTRIBUTING.md", "SECURITY.md", "SUPPORT.md", ".github/", "daemon/", "docs/"]) {
      if (!agent.readScope.includes(scope)) errors.push(`terminal agent ${agent.id ?? "(unknown)"} readScope should include ${scope}`);
    }
    if ((agent.role === "reviewer" || agent.role === "verifier") && !agent.readScope.includes("test-results/ux-audit/report.md")) {
      errors.push(`terminal agent ${agent.id ?? "(unknown)"} readScope should include UX audit report evidence`);
    }
    if (!Array.isArray(agent.writeScope)) errors.push(`terminal agent ${agent.id ?? "(unknown)"} must have writeScope array`);
    if ((agent.role === "reviewer" || agent.role === "researcher") && !agent.allowedCommands.includes("git diff --cached --stat")) {
      errors.push(`terminal ${agent.role} ${agent.id ?? "(unknown)"} should be allowed to inspect staged diff stats`);
    }
    if (agent.network && agent.searchByDefault !== true) errors.push(`terminal network agent ${agent.id ?? "(unknown)"} should enable searchByDefault`);
    if (!agent.network && agent.searchByDefault === true) errors.push(`terminal non-network agent ${agent.id ?? "(unknown)"} should not enable searchByDefault`);
    if (agent.writeScope.length && !agent.requiresWriteMode) errors.push(`terminal agent ${agent.id} has writeScope without requiresWriteMode`);
    if (agent.sandboxMode === "workspace-write" && !agent.requiresWriteMode) errors.push(`terminal agent ${agent.id} has workspace-write sandbox without requiresWriteMode`);
    if (agent.requiresWriteMode && agent.defaultLaunch !== false) errors.push(`terminal agent ${agent.id} requires write mode and must not launch by default`);
    if (agent.role === "builder") {
      requireEqual(agent.requiresWriteMode, true, `terminal builder ${agent.id} should require explicit write mode`);
      requireEqual(agent.defaultLaunch, false, `terminal builder ${agent.id} should not launch by default`);
    } else if (agent.role === "verifier") {
      requireEqual(agent.requiresWriteMode, true, `terminal verifier ${agent.id} should require explicit write mode for full gate execution`);
      requireEqual(agent.defaultLaunch, false, `terminal verifier ${agent.id} should not launch by default`);
    } else if (agent.role === "researcher" && run?.researchRequired === false) {
      requireEqual(agent.defaultLaunch, false, `terminal researcher ${agent.id} should not launch by default when research is disabled`);
    } else if (agent.writeScope.length) {
      errors.push(`terminal non-builder ${agent.id} should default to read-only writeScope`);
    }
    if (agent.maySpawnChildren) {
      if (agent.remainingDepth < 1 || agent.remainingDepth > manifest.budget.maxDepthInsideTerminal) {
        errors.push(`terminal agent ${agent.id} remainingDepth should fit inside maxDepthInsideTerminal`);
      }
    } else {
      requireEqual(agent.remainingDepth, 0, `terminal agent ${agent.id} should receive remainingDepth=0 when child spawning is disabled`);
    }
    requireEqual(agent.daemonActions, false, `terminal agent ${agent.id} should not use daemon actions`);
    requireEqual(agent.gitWrites, false, `terminal agent ${agent.id} should not use git writes by default`);
  }
}

function validateGeneratedTerminalArtifacts(runDir) {
  const result = spawnSync(process.execPath, [
    "scripts/codex-terminal-loop.mjs",
    "--packet",
    runDir,
    "--roles",
    "terminal-researcher",
    "--max-agents",
    "1"
  ], {
    cwd: tempRoot,
    encoding: "utf8",
    env: minimalChildEnv()
  });
  if (result.status !== 0) {
    errors.push(`terminal prompt generation failed: ${result.stderr || result.stdout}`);
    return;
  }
  const run = readJson(join(runDir, "run.json"));
  const manifest = readJson(run.artifacts.terminalAgents);
  const researcher = manifest.agents.find((agent) => agent.id === "terminal-researcher");
  if (!researcher) {
    errors.push("terminal prompt validation could not find terminal-researcher");
    return;
  }
  const prompt = readText(researcher.promptPath);
  for (const snippet of ["lifecycle_objective:", "read_scope:", "write_scope:", "allowed_commands:", "stop_condition:", "sandbox_mode:", "live_web_search: true", "timeout_ms:", "You must finish before timeout_ms", "Live web search is enabled by default", "Do not combine `fork_context: true` with `agent_type`", "Do not run broad empty-pattern reads"]) {
    if (!prompt.includes(snippet)) errors.push(`generated terminal prompt must mention ${snippet}`);
  }
  const launchScript = readText(join(dirname(researcher.promptPath), "launch-agents.sh"));
  for (const snippet of ["scripts/codex-terminal-loop.mjs", "--packet", "--roles", "terminal-researcher", "--max-agents", "--timeout-ms", "--launch", "launcher-generated failure reports"]) {
    if (!launchScript.includes(snippet)) errors.push(`generated terminal launch script must mention ${snippet}`);
  }
  if (launchScript.includes("pids=()") || launchScript.includes("wait \"$pid\"")) {
    errors.push("generated terminal launch script should re-enter the Node launcher instead of direct child process management");
  }
  const searchIndex = launchScript.indexOf("'--search'");
  const execIndex = launchScript.indexOf("'exec'");
  const selectedAgents = readText(join(dirname(researcher.promptPath), "selected-agents.json"));
  if (!selectedAgents.includes('"searchEnabledAgentIds"') || !selectedAgents.includes('"terminal-researcher"')) {
    errors.push("generated terminal metadata should record terminal-researcher as search-enabled by default");
  }
  if (searchIndex >= 0 || execIndex >= 0) errors.push("generated terminal launch script should not shell out to codex directly");
}

function setupTempRepo() {
  cpSync(join(repoRoot, "scripts"), join(tempRoot, "scripts"), { recursive: true });
}

function findGeneratedRunDir(root) {
  const profilesRoot = join(root, ".cognopticon", "profiles");
  if (!existsSync(profilesRoot)) return undefined;
  const candidates = [];
  for (const profile of safeReadDir(profilesRoot)) {
    const loopsRoot = join(profilesRoot, profile, "loops");
    for (const runId of safeReadDir(loopsRoot)) {
      const runDir = join(loopsRoot, runId);
      const runJson = join(runDir, "run.json");
      if (existsSync(runJson)) candidates.push({ runDir, mtimeMs: statSync(runJson).mtimeMs });
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.runDir;
}

function safeReadDir(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path);
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

function requireNotIncludes(values, expected, message) {
  if (Array.isArray(values) && values.includes(expected)) errors.push(message);
}

function requireString(value, message) {
  if (typeof value !== "string" || !value.trim()) errors.push(message);
}

function requirePhaseBefore(values, first, second, message) {
  if (!Array.isArray(values)) {
    errors.push(message);
    return;
  }
  const firstIndex = values.indexOf(first);
  const secondIndex = values.indexOf(second);
  if (firstIndex === -1 || secondIndex === -1 || firstIndex > secondIndex) errors.push(message);
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
