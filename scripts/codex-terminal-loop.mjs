#!/usr/bin/env node
import { chmodSync, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packetArg = argValue("--packet");
const objective = argValue("--objective");
const shouldLaunch = process.argv.includes("--launch");
const allowSearch = process.argv.includes("--search");
const allowWrite = process.argv.includes("--allow-write");
const timeoutMs = numberArg("--timeout-ms", 600000);
const maxAgentsArg = numberArg("--max-agents");
const roleFilter = parseList(argValue("--roles"));

if (!packetArg && !objective) {
  console.error('Usage: node scripts/codex-terminal-loop.mjs --packet "<runDir>" [--launch] [--roles terminal-verifier,terminal-reviewer] [--no-search]');
  console.error('   or: node scripts/codex-terminal-loop.mjs --objective "Bounded objective" [--launch]');
  process.exit(1);
}

const runDir = packetArg ? packetRunDir(packetArg) : generatePacket(objective);
const run = readJson(join(runDir, "run.json"));
const manifestPath = run.artifacts?.terminalAgents;

if (!manifestPath || !existsSync(manifestPath)) {
  console.error(`Lifecycle packet does not include terminal-agents.json: ${runDir}`);
  console.error("Regenerate the packet with the current scripts/lifecycle-loop.mjs.");
  process.exit(1);
}

const manifest = readJson(manifestPath);
const terminalDir = join(runDir, "terminal-agents");
const logDir = join(terminalDir, "logs");
mkdirSync(logDir, { recursive: true });

const maxAgents = maxAgentsArg ?? manifest.budget?.maxFreshTerminals ?? 3;
const selectedAgents = selectAgents(manifest.agents ?? [], roleFilter).slice(0, maxAgents);
const searchEnabledAgentIds = selectedAgents.filter(searchEnabledFor).map((agent) => agent.id);
if (!selectedAgents.length) {
  console.error(`No terminal agents selected from ${manifestPath}`);
  process.exit(1);
}
for (const agent of selectedAgents) {
  if (agent.requiresWriteMode && !allowWrite) {
    console.error(`${agent.id} requires --allow-write and an explicit role selection.`);
    process.exit(1);
  }
}

for (const agent of selectedAgents) {
  mkdirSync(dirname(agent.promptPath), { recursive: true });
  writeFileSync(agent.promptPath, `${renderPrompt(run, manifest, agent)}\n`, "utf8");
}

const launchScript = join(terminalDir, "launch-agents.sh");
writeFileSync(launchScript, `${renderLaunchScript(selectedAgents)}\n`, "utf8");
chmodSync(launchScript, 0o755);
writeFileSync(join(terminalDir, "selected-agents.json"), `${JSON.stringify({ runDir, selectedAgents, allowSearch, searchEnabledAgentIds, allowWrite, timeoutMs }, null, 2)}\n`, "utf8");

if (!shouldLaunch) {
  console.log(`Prepared fresh Codex terminal prompts for ${selectedAgents.length} agent(s): ${terminalDir}`);
  console.log(`Launch script: ${launchScript}`);
  console.log("Add --launch to run the selected agents now.");
  process.exit(0);
}

const results = await Promise.all(selectedAgents.map((agent) => launchAgent(agent)));
writeFileSync(join(terminalDir, "terminal-run.json"), `${JSON.stringify({ runDir, startedAt: new Date().toISOString(), results }, null, 2)}\n`, "utf8");

const failures = results.filter((result) => result.exitCode !== 0 || result.timedOut || !result.reportExists || result.reportGeneratedByLauncher);
if (failures.length) {
  console.error(`Fresh Codex terminal loop finished with ${failures.length} failed agent(s).`);
  for (const failure of failures) {
    const reportNote = failure.reportExists ? `report=${failure.reportBytes} bytes${failure.reportGeneratedByLauncher ? " launcher-generated" : ""}` : "report=missing";
    console.error(`- ${failure.id}: exit=${failure.exitCode} timedOut=${failure.timedOut} ${reportNote}`);
  }
  process.exit(1);
}

console.log(`Fresh Codex terminal loop completed: ${results.length} agent report(s) in ${terminalDir}`);

function launchAgent(agent) {
  return new Promise((resolveResult) => {
    const stdoutPath = join(logDir, `${agent.id}.stdout.jsonl`);
    const stderrPath = join(logDir, `${agent.id}.stderr.log`);
    const tmpDir = join(terminalDir, "tmp", agent.id);
    mkdirSync(tmpDir, { recursive: true });
    const stdout = createWriteStream(stdoutPath, { flags: "w" });
    const stderr = createWriteStream(stderrPath, { flags: "w" });
    const args = [
      "--sandbox", sandboxFor(agent),
      "--ask-for-approval", "never",
      ...(searchEnabledFor(agent) ? ["--search"] : []),
      "exec",
      "--cd", repoRoot,
      "--json",
      "--output-last-message", agent.artifactPath
    ];
    args.push("-");

    const child = spawn("codex", args, {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir }
    });
    let timedOut = false;
    let stdinError;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 5000).unref();
    }, timeoutMs);
    timer.unref();

    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") stdinError = error;
    });
    child.stdin.end(readFileSync(agent.promptPath, "utf8"));

    child.on("error", (error) => {
      clearTimeout(timer);
      stdout.end();
      stderr.end();
      const report = ensureReport(agent, {
        status: "error",
        error: error.message,
        timedOut,
        exitCode: 1,
        stdinError: stdinError?.message,
        stdoutPath,
        stderrPath
      });
      resolveResult({
        id: agent.id,
        role: agent.role,
        command: renderCommand(agent),
        exitCode: 1,
        timedOut,
        error: error.message,
        reportPath: agent.artifactPath,
        reportExists: report.exists,
        reportBytes: report.bytes,
        reportGeneratedByLauncher: report.generatedByLauncher,
        stdoutPath,
        stderrPath
      });
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      stdout.end();
      stderr.end();
      const report = ensureReport(agent, {
        status: exitCode === 0 && !timedOut ? "completed-without-report" : "failed",
        exitCode,
        timedOut,
        stdinError: stdinError?.message,
        stdoutPath,
        stderrPath
      });
      resolveResult({
        id: agent.id,
        role: agent.role,
        command: renderCommand(agent),
        exitCode,
        timedOut,
        reportPath: agent.artifactPath,
        reportExists: report.exists,
        reportBytes: report.bytes,
        reportGeneratedByLauncher: report.generatedByLauncher,
        stdoutPath,
        stderrPath
      });
    });
  });
}

function renderPrompt(run, manifest, agent) {
  return [
    "You are a fresh Codex terminal instance launched by the Cognopticon root supervisor.",
    "",
    "This is Codex-as-builder process orchestration, not Cognopticon browser/daemon dispatch.",
    "",
    "## Contract",
    `parent_agent_id: ${agent.parentAgentId}`,
    `loop_id: ${agent.loopId}`,
    `role: ${agent.role}`,
    `lifecycle_objective: ${run.objective}`,
    `objective: ${agent.objective}`,
    `read_scope: ${agent.readScope.join(", ")}`,
    `write_scope: ${agent.writeScope.length ? agent.writeScope.join(", ") : "none"}`,
    `allowed_commands: ${agent.allowedCommands.join(", ")}`,
    `stop_condition: ${agent.stopCondition}`,
    `artifact_path: ${agent.artifactPath}`,
    `may_spawn_children: ${String(agent.maySpawnChildren)}`,
    `remaining_depth: ${agent.remainingDepth}`,
    `live_web_search: ${String(searchEnabledFor(agent))}`,
    `timeout_ms: ${timeoutMs}`,
    `daemon_actions: ${String(agent.daemonActions)}`,
    `git_writes: ${String(agent.gitWrites)}`,
    `sandbox_mode: ${sandboxFor(agent)}`,
    "",
    "## Product Boundary",
    "- Do not claim Cognopticon's browser app or daemon dispatched you.",
    "- Do not start daemon actions, git writes, commits, pushes, resets, or destructive commands.",
    sandboxFor(agent) === "workspace-write"
      ? "- Do not edit tracked files unless this is the explicitly selected builder role and the file is inside write_scope."
      : "- Do not edit tracked files in this read-only launch mode.",
    "- You may read files and run commands listed in allowed_commands.",
    agent.network
      ? "- Live web search is enabled by default for this research-capable role unless the launcher used `--no-search`."
      : "- Live web search is not enabled for this role.",
    "",
    "## Subagent Behavior",
    agent.maySpawnChildren
      ? "- You are authorized to attempt one bounded `multi_agent_v1.spawn_agent` sidecar if that tool is available and materially useful."
      : "- Do not spawn child agents for this scope; report if the work needs a broader delegated review.",
    "- Do not combine `fork_context: true` with `agent_type`; either omit fork_context or omit agent_type. Prefer passing needed context in the sidecar prompt.",
    agent.maySpawnChildren
      ? "- The sidecar must be read-only, narrower than your own task, and must return evidence or adversarial review."
      : "- Internal role labels do not count as delegation.",
    agent.remainingDepth > 0
      ? "- A sub-subagent is allowed only if the parent sidecar defines a smaller objective, stop condition, artifact path, and remaining depth 0."
      : "- Sub-subagents are not authorized for this launch.",
    "- If live subagent tooling is unavailable when authorized, report that explicitly. Do not pretend internal role-play was delegation.",
    "",
    "## Read Scope",
    ...agent.readScope.map((item) => `- ${item}`),
    "",
    "## Write Scope",
    ...(agent.writeScope.length ? agent.writeScope.map((item) => `- ${item}`) : ["- None in this read-only launch."]),
    "",
    "## Allowed Commands",
    ...agent.allowedCommands.map((item) => `- ${item}`),
    "",
    "## Command Hygiene",
    "- Do not run broad empty-pattern reads such as `rg -n \"\"`; use targeted `rg` patterns or small `sed` windows.",
    "- Keep command output narrow enough for the root supervisor to audit.",
    "",
    "## Run Artifacts",
    `- supervisor: ${run.artifacts.supervisor}`,
    run.researchRequired ? `- research brief: ${run.artifacts.researchBrief}` : "- research brief: disabled",
    `- planner: ${run.artifacts.planner}`,
    `- mission: ${run.artifacts.mission}`,
    `- terminal orchestrator: ${run.artifacts.terminalOrchestrator}`,
    "",
    "## Final Report",
    `You must finish before timeout_ms=${timeoutMs}. If the scope is too broad, return a partial findings report instead of continuing to explore.`,
    "Return a concise Markdown report with:",
    "- Role and objective.",
    "- Whether you used live subagents; include their conclusion or why unavailable.",
    "- Findings or evidence, with file/line references when relevant.",
    "- Commands run and exact outcomes.",
    "- Residual risks.",
    "- Integration recommendation: accept, revise, reject, or needs another loop.",
    "",
    `Root budget reminder: maxFreshTerminals=${manifest.budget?.maxFreshTerminals ?? 3}, maxDepthInsideTerminal=${manifest.budget?.maxDepthInsideTerminal ?? 2}.`
  ].filter(Boolean).join("\n");
}

function renderLaunchScript(agents) {
  const args = [
    process.execPath,
    join(repoRoot, "scripts", "codex-terminal-loop.mjs"),
    "--packet",
    runDir,
    "--roles",
    agents.map((agent) => agent.id).join(","),
    "--max-agents",
    String(agents.length),
    "--timeout-ms",
    String(timeoutMs),
    ...(allowWrite ? ["--allow-write"] : []),
    ...(process.argv.includes("--no-search") ? ["--no-search"] : []),
    ...(allowSearch ? ["--search"] : []),
    "--launch"
  ];
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "# Re-enter the Node launcher so timeout handling, missing-report detection,",
    "# selected-agents.json, terminal-run.json, and launcher-generated failure reports",
    "# stay identical to `node scripts/codex-terminal-loop.mjs --launch`.",
    args.map(shellQuote).join(" ")
  ].join("\n");
}

function renderCommand(agent) {
  const args = [
    "codex",
    "--sandbox", sandboxFor(agent),
    "--ask-for-approval", "never",
    ...(searchEnabledFor(agent) ? ["--search"] : []),
    "exec",
    "--cd", repoRoot,
    "--json",
    "--output-last-message", agent.artifactPath
  ];
  args.push("-");
  return args.map(shellQuote).join(" ");
}

function searchEnabledFor(agent) {
  if (!agent.network) return false;
  if (process.argv.includes("--no-search")) return false;
  return allowSearch || agent.searchByDefault !== false;
}

function selectAgents(agents, filters) {
  if (!filters?.length) return agents.filter((agent) => agent.defaultLaunch !== false);
  const wanted = new Set(filters);
  return agents.filter((agent) => wanted.has(agent.id) || wanted.has(agent.role));
}

function sandboxFor(agent) {
  if (agent.requiresWriteMode && !allowWrite) return "read-only";
  if (agent.requiresWriteMode && allowWrite) return "workspace-write";
  return agent.sandboxMode ?? "read-only";
}

function reportStatus(path) {
  if (!existsSync(path)) return { exists: false, bytes: 0, generatedByLauncher: false };
  return { exists: true, bytes: statSync(path).size, generatedByLauncher: false };
}

function ensureReport(agent, context) {
  const existing = reportStatus(agent.artifactPath);
  if (existing.exists) return existing;
  const stdoutTail = tailText(context.stdoutPath);
  const stderrTail = tailText(context.stderrPath);
  writeFileSync(agent.artifactPath, [
    "# Terminal Agent Failure Report",
    "",
    `Role: ${agent.role}`,
    `Objective: ${agent.objective}`,
    `Status: ${context.status}`,
    `Exit code: ${context.exitCode ?? "none"}`,
    `Timed out: ${String(context.timedOut)}`,
    context.error ? `Error: ${context.error}` : undefined,
    context.stdinError ? `Stdin error: ${context.stdinError}` : undefined,
    "",
    "The child Codex process did not produce its required final report. The root launcher wrote this failure artifact so the supervisor has auditable evidence instead of a missing file.",
    "",
    "## Logs",
    `- stdout: ${context.stdoutPath}`,
    `- stderr: ${context.stderrPath}`,
    "",
    "## Stdout Tail",
    "```jsonl",
    stdoutTail || "(empty)",
    "```",
    "",
    "## Stderr Tail",
    "```text",
    stderrTail || "(empty)",
    "```"
  ].filter((line) => line !== undefined).join("\n"), "utf8");
  return { ...reportStatus(agent.artifactPath), generatedByLauncher: true };
}

function tailText(path, bytes = 16_000) {
  if (!path || !existsSync(path)) return "";
  const text = readFileSync(path, "utf8");
  return text.length > bytes ? text.slice(-bytes) : text;
}

function generatePacket(value) {
  const result = spawnSync(process.execPath, ["scripts/lifecycle-loop.mjs", "--objective", value], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  const match = result.stdout.match(/Created Cognopticon lifecycle packet: (.+)\s*$/m);
  if (!match) {
    process.stderr.write(result.stdout);
    console.error("lifecycle-loop did not report a packet directory");
    process.exit(1);
  }
  return match[1].trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function packetRunDir(value) {
  const resolved = resolve(value);
  return resolved.endsWith("run.json") ? dirname(resolved) : resolved;
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function numberArg(flag, fallback) {
  const value = argValue(flag);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value) {
  if (!value) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
