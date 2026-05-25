#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { loadRuntimeConfig } from "./runtime-config.mjs";
import { releaseGateCommands } from "./verification-gates.mjs";

const runtimeConfig = loadRuntimeConfig();
const objective = argValue("--objective") ?? "Finish the active Cognopticon goal to verified, release-ready quality.";
const scope = parseList(argValue("--scope")) ?? [];
const gates = parseList(argValue("--gates")) ?? releaseGateCommands;
const researchRequired = argValue("--research") !== "off";
const uxRequired = argValue("--ux") !== "off";
const researchSkipReason = researchRequired ? undefined : skipReason("--research-reason", "Research disabled by supervisor with --research off for a bounded packet that should not lock new implementation direction.");
const uxSkipReason = uxRequired ? undefined : skipReason("--ux-reason", "UX audit disabled by supervisor with --ux off for a bounded packet that should not accept frontend changes.");
const readOnly = process.argv.includes("--read-only") || /(?:^|\b)(?:adversarial\s+)?read-only review|review-only(?:\b|$)/i.test(objective);
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slug(objective).slice(0, 36)}`;
const runDir = join(runtimeConfig.profile.paths.loops, runId);

mkdirSync(runDir, { recursive: true });

const run = {
  id: runId,
  profileId: runtimeConfig.profile.id,
  deviceId: runtimeConfig.profile.deviceId,
  objective,
  scope,
  gates,
  researchRequired,
  uxRequired,
  readOnly,
  ...(researchSkipReason ? { researchSkipReason } : {}),
  ...(uxSkipReason ? { uxSkipReason } : {}),
  phaseOrder: [
    "supervisor",
    ...(researchRequired ? ["researcher", "research_brief"] : []),
    "planner",
    "mission",
    "terminal_orchestrator",
    "reviewer",
    "verifier",
    ...(uxRequired ? ["ux_auditor"] : []),
    "integrator",
    "handoff",
    "final_report"
  ],
  status: "packet_generated",
  createdAt: new Date().toISOString(),
  artifacts: {
    supervisor: join(runDir, "supervisor.md"),
    researcher: join(runDir, "researcher.md"),
    researchBrief: join(runDir, "research-brief.md"),
    planner: join(runDir, "planner.md"),
    mission: join(runDir, "mission.md"),
    reviewer: join(runDir, "reviewer.md"),
    verifier: join(runDir, "verifier.md"),
    uxAuditor: join(runDir, "ux-auditor.md"),
    integrator: join(runDir, "integrator.md"),
    terminalOrchestrator: join(runDir, "terminal-orchestrator.md"),
    terminalAgents: join(runDir, "terminal-agents.json"),
    handoff: join(runDir, "handoff.md"),
    finalReport: join(runDir, "final-report.md")
  }
};

writeFileSync(join(runDir, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
writeFileSync(run.artifacts.supervisor, `${supervisorPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.researcher, `${researcherPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.researchBrief, `${researchBriefTemplate(run)}\n`, "utf8");
writeFileSync(run.artifacts.planner, `${plannerPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.mission, `${missionPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.reviewer, `${reviewerPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.verifier, `${verifierPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.uxAuditor, `${uxAuditorPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.integrator, `${integratorPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.terminalOrchestrator, `${terminalOrchestratorPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.terminalAgents, `${JSON.stringify(terminalAgentsManifest(run), null, 2)}\n`, "utf8");
writeFileSync(run.artifacts.handoff, `${handoffPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.finalReport, `${finalReportTemplate(run)}\n`, "utf8");

console.log(`Created Cognopticon lifecycle packet: ${runDir}`);

function supervisorPrompt(run) {
  return [
    "# Cognopticon Supervisory Orchestrator",
    "",
    `Objective: ${run.objective}`,
    `Profile: ${run.profileId} (${run.deviceId})`,
    "",
    "You are the systems architect, project manager, and supervisory orchestrator. Do not treat this as a one-shot coding task.",
    "",
    "## Responsibilities",
    "- Convert the objective into acceptance criteria and worker scopes.",
    "- Run the prior-art researcher before locking implementation direction unless research is explicitly disabled.",
    "- Assign bounded builder work with disjoint write scopes.",
    "- In required multi-agent mode, launch fresh Codex terminal workers from `terminal-orchestrator.md` instead of simulating role labels in one session.",
    "- Require reviewer, verifier, and UX-auditor evidence before accepting changes.",
    "- Reject outputs that are first-working, demo-only, frontend-sloppy, privacy-risky, or insufficiently verified.",
    "- Integrate only after blocking findings are resolved.",
    "",
    "## Packet Order",
    ...(run.researchRequired ? ["1. `researcher.md`"] : [`1. Research disabled for this packet; reason: ${run.researchSkipReason}`]),
    ...(run.researchRequired ? ["2. `research-brief.md` plan-lock evidence"] : []),
    "3. `planner.md`",
    "4. `mission.md` for builder implementation",
    "5. `terminal-orchestrator.md` and `terminal-agents.json` for fresh Codex process fanout",
    "6. `reviewer.md`",
    "7. `verifier.md`",
    ...(run.uxRequired ? ["8. `ux-auditor.md`"] : [`8. UX audit disabled for this packet; reason: ${run.uxSkipReason}`]),
    "9. `integrator.md`",
    "10. `handoff.md` for manual second-terminal fallback when useful",
    "11. `final-report.md`",
    "",
    "## Acceptance Rule",
    "Do not mark the lifecycle complete until the final report names exact evidence, unresolved risks, and whether the output is accepted, rejected, or needs another loop.",
    "",
    "## Required Evidence Trail",
    ...(run.researchRequired
      ? [
          "- `research-brief.md` names source links, license decisions, maintenance signals, and reuse choices before plan lock.",
          "- `planner.md` records how research changed the plan or why no reuse was chosen."
        ]
      : [
          `- Research is explicitly skipped for this packet: ${run.researchSkipReason}`,
          "- If the work expands into new implementation direction, regenerate the packet with research enabled before plan lock."
        ]),
    "- Reviewer and verifier outputs name exact files, commands, and outcomes.",
    ...(run.uxRequired
      ? ["- UX auditor output names real browser coverage and screenshot evidence before frontend acceptance."]
      : [
          `- UX audit is explicitly skipped for this packet: ${run.uxSkipReason}`,
          "- If UI changes enter this packet, run the UX audit before acceptance."
        ]),
    "- `terminal-orchestrator.md` distinguishes Codex-internal process spawning from Cognopticon app/daemon dispatch.",
    "- `handoff.md` remains a bounded manual packet rather than a broad project mandate."
  ].join("\n");
}

function researcherPrompt(run) {
  return [
    "# Cognopticon Prior-Art Researcher",
    "",
    `Research objective: ${run.objective}`,
    "",
    "Search for mature open-source projects, libraries, patterns, and implementation references before implementation direction is locked.",
    "",
    `Write findings into: ${run.artifacts.researchBrief}`,
    "",
    "## Required Output",
    "- Repos/packages found, with links and retrieval dates.",
    "- License and compatibility notes. MIT/Apache/BSD are preferred; GPL/AGPL require explicit acceptance; no-license means no copying.",
    "- Maintenance signals: recent commits, releases, tests, docs, issue health.",
    "- What to reuse: dependency, architecture, algorithm, UX pattern, small attributed snippet, or nothing.",
    "- Fit/risk analysis for Cognopticon's local-first, private-profile, daemon-safety, graph-native product model.",
    "- Recommendation for the planner.",
    "- Rejection rationale for any tempting project that should not be reused.",
    "- Explicitly say whether live GitHub/web search was available, and name the command/path used to search.",
    "",
    "## Constraints",
    "- Do not paste code into the product plan without license/provenance.",
    "- Prefer using a dependency or pattern over vendoring code.",
    "- Treat frontend interaction patterns as prior art too, not only backend libraries.",
    "- If network research is unavailable, record the exact blocker and use locally cached docs only as provisional evidence."
  ].join("\n");
}

function researchBriefTemplate(run) {
  if (!run.researchRequired) {
    return [
      "# Cognopticon Research Brief",
      "",
      `Run: ${run.id}`,
      `Objective: ${run.objective}`,
      "",
      "## Research Status",
      "- [ ] complete",
      "- [ ] blocked",
      "- [x] skipped with explicit supervisor approval",
      "",
      "## Skip Rationale",
      "- Supervisor approval: `--research off`",
      `- Reason: ${run.researchSkipReason}`,
      "- Plan-lock rule: do not use this packet to choose new implementation direction without generating a research-enabled packet or completing this brief.",
      "",
      "## Source Matrix",
      "| Source | URL | Retrieved | License | Maintenance signal | Useful idea | Reuse decision |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      `| Not applicable | local supervisor packet flag | ${run.createdAt.slice(0, 10)} | N/A | Review-only or bounded non-research scope | No external code considered | No code copied |`,
      "",
      "## License Gate",
      "- Dependencies or copied snippets approved: None.",
      "- Sources rejected because of license/provenance: Not applicable.",
      "- Attribution needed in code/docs: None.",
      "",
      "## Fit For Cognopticon",
      "- Local-first/private-profile implications: Skip is recorded only in ignored lifecycle state.",
      "- Daemon authority implications: No daemon authority expansion is approved by this skip.",
      "- Public demo implications: No public asset reuse is approved by this skip.",
      "- Frontend/UX implications: No frontend pattern or asset reuse is approved by this skip.",
      "",
      "## Recommendation To Planner",
      "- Reuse: None from prior art in this skipped packet.",
      "- Avoid: Treating the skipped brief as permission to lock product direction.",
      "- Open questions before plan lock: Regenerate with research enabled if implementation direction changes."
    ].join("\n");
  }

  return [
    "# Cognopticon Research Brief",
    "",
    `Run: ${run.id}`,
    `Objective: ${run.objective}`,
    "",
    "## Research Status",
    "- [ ] complete",
    "- [ ] blocked",
    "- [ ] skipped with explicit supervisor approval",
    "",
    "## Source Matrix",
    "| Source | URL | Retrieved | License | Maintenance signal | Useful idea | Reuse decision |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    "|  |  |  |  |  |  |  |",
    "",
    "## License Gate",
    "- Dependencies or copied snippets approved:",
    "- Sources rejected because of license/provenance:",
    "- Attribution needed in code/docs:",
    "",
    "## Fit For Cognopticon",
    "- Local-first/private-profile implications:",
    "- Daemon authority implications:",
    "- Public demo implications:",
    "- Frontend/UX implications:",
    "",
    "## Recommendation To Planner",
    "- Reuse:",
    "- Avoid:",
    "- Open questions before plan lock:"
  ].join("\n");
}

function plannerPrompt(run) {
  return [
    "# Cognopticon Planner",
    "",
    `Planning objective: ${run.objective}`,
    "",
    "Use the research artifact if available. Produce a decision-complete implementation plan for the builder.",
    run.researchRequired
      ? `Do not lock the plan until ${run.artifacts.researchBrief} has complete source, license, maintenance, reuse, and rejection notes.`
      : `Research was disabled for this packet; skip reason: ${run.researchSkipReason}`,
    run.researchRequired
      ? `Before plan lock, run: npm run validate:lifecycle -- --packet "${dirname(run.artifacts.researchBrief)}" --complete-research`
      : "Do not run complete-research validation when research is disabled.",
    "",
    "## Plan Must Include",
    "- Product/user outcome.",
    "- Files/subsystems in scope.",
    "- Out-of-scope boundaries.",
    "- Public/private data implications.",
    "- Daemon authority implications.",
    "- Frontend acceptance criteria if UI is touched.",
    "- Test and screenshot gates.",
    "- Worker write scopes if parallel workers are useful.",
    "- Fresh Codex terminal scopes if the supervisor is running required multi-agent mode.",
    "- Explicit prior-art decision: reuse dependency, borrow pattern, write from scratch, or defer.",
    "",
    "Do not call the plan complete if material product intent, safety, or frontend acceptance criteria are still ambiguous."
  ].join("\n");
}

function missionPrompt(run) {
  return [
    "# Cognopticon Lifecycle Mission",
    "",
    `Objective: ${run.objective}`,
    `Profile: ${run.profileId} (${run.deviceId})`,
    "",
    "## Authority",
    ...(run.readOnly
      ? [
          "- This is a read-only lifecycle packet. Do not implement, edit tracked files, or accept frontend/product changes from this packet.",
          "- Return findings, evidence, and integration recommendation only."
        ]
      : ["- Work only inside the requested scope unless the repo proves a small adjacent edit is required."]),
    "- Preserve unrelated local changes.",
    "- Do not run destructive git commands.",
    "- Treat generated local state as private and never move it into public assets.",
    "- Stop and report if the public/private boundary becomes ambiguous.",
    "",
    "## Scope",
    ...(run.scope.length ? run.scope.map((item) => `- ${item}`) : ["- Infer the smallest coherent implementation slice from the objective."]),
    "",
    "## Required Loop",
    "1. Inspect the repo and identify concrete acceptance criteria.",
    run.researchRequired
      ? "2. Read `research-brief.md` and `planner.md`; stop if the plan is locked without required research."
      : `2. Read \`research-brief.md\` skip status and \`planner.md\`; research was skipped for this packet because: ${run.researchSkipReason}`,
    ...(run.readOnly
      ? [
          "3. Review the scoped surfaces without editing tracked files.",
          "4. Run only read-only checks allowed by the terminal contract.",
          "5. Report blocking findings, residual risks, and whether a follow-up implementation loop is required."
        ]
      : [
          "3. Implement the slice completely.",
          "4. Run the verification gates that apply.",
          "5. Hand the changed files and verification output to an independent reviewer.",
          "6. Revise until the reviewer has no blocking findings.",
          "7. Produce the final report."
        ]),
    "",
    "## Required Multi-Agent Mode",
    "When the user has authorized process-supervised multi-agent mode, the root supervisor launches fresh Codex terminal instances from `terminal-orchestrator.md` and `terminal-agents.json`.",
    "Those child Codex instances may use their own bounded subagents only when `terminal-agents.json` grants child-spawn permission, but the Cognopticon browser app and daemon still do not dispatch hidden workers.",
    "",
    "## Verification Gates",
    ...run.gates.map((gate) => `- ${gate}`),
    "",
    "## Final Report Must Include",
    ...(run.readOnly ? ["- Reviewed files", "- Findings or explicit no-blocker statement"] : ["- Changed files", "- Product behavior added or repaired"]),
    "- Prior-art status and reuse/license decisions",
    "- Verification commands and exact pass/fail status",
    "- Remaining risks or explicit statement that none are known"
  ].join("\n");
}

function reviewerPrompt(run) {
  return [
    "# Cognopticon Lifecycle Reviewer",
    "",
    `Review objective: ${run.objective}`,
    "",
    "Take a code-review stance. Findings first, ordered by severity, with file/line references.",
    "Focus on privacy leaks, unsafe daemon authority, profile cross-contamination, broken local/public mode behavior, weak tests, shallow prior-art use, and UI regressions.",
    "Do not praise. If there are no blocking findings, say so clearly and list residual risks."
  ].join("\n");
}

function verifierPrompt(run) {
  return [
    "# Cognopticon Lifecycle Verifier",
    "",
    "Run or inspect the verification gates independently and report exact outcomes.",
    "",
    "## Gates",
    ...run.gates.map((gate) => `- ${gate}`),
    "",
    "If a gate cannot be run, explain the environmental blocker and identify the closest evidence available."
  ].join("\n");
}

function uxAuditorPrompt(run) {
  if (!run.uxRequired) {
    return [
      "# Cognopticon UX Auditor",
      "",
      `UX audit objective: ${run.objective}`,
      "",
      "## UX Audit Status",
      "- [x] skipped with explicit supervisor approval",
      "",
      "## Skip Rationale",
      "- Supervisor approval: `--ux off`",
      `- Reason: ${run.uxSkipReason}`,
      "- Acceptance rule: do not accept frontend changes from this packet without a real browser UX audit and screenshots.",
      "",
      "If UI changes enter this packet, audit the live product in a real browser and record screenshots or exact screenshot paths before integration."
    ].join("\n");
  }

  return [
    "# Cognopticon UX Auditor",
    "",
    `UX audit objective: ${run.objective}`,
    "",
    "Audit the live product in a real browser. Source inspection is not enough.",
    "",
    "## Required Viewports",
    "- 360x800",
    "- 390x844",
    "- 412x915",
    "- 768x1024",
    "- 1024x768",
    "- 1440x1000",
    "- 1920x1080",
    "",
    "## Findings Must Cover",
    "- Horizontal overflow.",
    "- Text overlap or clipped labels.",
    "- Touch targets below 44px.",
    "- Graph usefulness versus decoration.",
    "- Workflow clarity for first-run, demo, local profile, mission, daemon, and agent loop states.",
    "- Screenshots or exact screenshot paths.",
    "",
    "Do not accept a frontend slice because tests pass. Accept it only if the interface looks and behaves like a finished product."
  ].join("\n");
}

function integratorPrompt(run) {
  return [
    "# Cognopticon Integrator",
    "",
    `Integration objective: ${run.objective}`,
    "",
    "Read builder, reviewer, verifier, UX auditor, research, and terminal-agent artifacts. Decide whether to accept, revise, or reject the loop output.",
    "",
    "## Integration Checklist",
    "- Blocking reviewer findings resolved.",
    "- Verification gates passed or blockers are environmental and documented.",
    "- UX audit passed for touched surfaces.",
    "- Release/privacy hygiene passed.",
    "- Public/demo mode and private profile mode remain separated.",
    ...(run.researchRequired
      ? ["- Prior-art/license decisions are documented in `research-brief.md` and reflected in the plan."]
      : ["- Research skip status is documented in `research-brief.md` and reflected in the plan."]),
    ...(run.researchRequired ? [] : [`- Research skip rationale remains valid: ${run.researchSkipReason}`]),
    ...(run.uxRequired ? [] : [`- UX skip rationale remains valid and no frontend acceptance depends on this packet: ${run.uxSkipReason}`]),
    "- Fresh Codex terminal reports, when used, have explicit parent, scope, stop condition, and artifact evidence.",
    "- Final report is specific enough for human review.",
    "",
    "If any item fails, send the work back into another bounded loop instead of calling it complete."
  ].join("\n");
}

function terminalOrchestratorPrompt(run) {
  return [
    "# Process-Supervised Codex Terminal Orchestrator",
    "",
    `Run: ${run.id}`,
    `Objective: ${run.objective}`,
    "",
    "This artifact is for Codex-as-builder orchestration. It does not change Cognopticon product behavior.",
    "",
    "## Product Boundary",
    "- Cognopticon's browser app and daemon do not auto-spawn worker agents.",
    "- The app prepares validated mission packets, records approved local daemon events, and exposes manual handoff paths.",
    "- No child Codex process may claim it was dispatched by the Cognopticon daemon or widen daemon authority.",
    "",
    "## Required Process Loop",
    "1. Keep the root Codex session as depth 0 supervisor and final integrator.",
    "2. Launch fresh Codex terminal processes for bounded roles with `node scripts/codex-terminal-loop.mjs --packet <runDir> --launch`.",
    "3. Read-only reviewer/researcher roles launch by default; verifier and builder roles require explicit role selection, and write-capable roles require `--allow-write`.",
    ...(run.researchRequired ? [] : ["   For this packet, research is disabled, so the researcher role is available only when explicitly selected."]),
    "4. Each fresh terminal process may use its own `multi_agent_v1.spawn_agent` sidecars only when the manifest grants child-spawn permission.",
    "5. Sub-subagents are allowed only when the manifest grants remaining depth and the parent defines a smaller objective, explicit stop condition, artifact path, and remaining depth of 0.",
    "6. The root supervisor integrates reports; child processes do not commit, push, reset, or change public/private boundaries.",
    "",
    "## Budgets",
    "- Root supervisor: 1 always-on session.",
    "- Fresh Codex terminal processes: maximum 3 concurrent unless the supervisor explicitly lowers the launch with `--max-agents`.",
    "- Child subagents per terminal: default 2, maximum 3.",
    "- Maximum nested depth inside a child terminal: 2; no depth 3.",
    "- One active sub-subagent chain per terminal process.",
    "",
    "## Child Contract",
    "Every child terminal prompt must name:",
    "- parent_agent_id",
    "- loop_id",
    "- role",
    "- objective",
    "- read_scope",
    "- write_scope",
    "- allowed_commands",
    "- stop_condition",
    "- artifact_path",
    "- may_spawn_children",
    "- remaining_depth",
    "- daemon_actions=false",
    "- git_writes=false unless explicitly granted",
    "- sandbox_mode",
    "",
    "## Integration Gate",
    "Do not accept terminal output until each launched child has written its report artifact, named whether it used subagents, listed verification evidence, and identified residual risks."
  ].join("\n");
}

function terminalAgentsManifest(run) {
  const agentDir = join(dirname(run.artifacts.terminalAgents), "terminal-agents");
  return {
    version: 1,
    mode: "codex_internal_terminal",
    loopId: run.id,
    objective: run.objective,
    rootSupervisor: {
      depth: 0,
      ownsIntegration: true,
      mayMutateTrackedFiles: !run.readOnly
    },
    productBoundary: {
      browserAppDispatchesAgents: false,
      daemonDispatchesAgents: false,
      manualHandoffRemainsProductTruth: true
    },
    budget: {
      maxFreshTerminals: 3,
      maxSubagentsPerTerminal: 3,
      maxDepthInsideTerminal: 2,
      maxActiveSubSubagentChainsPerTerminal: 1
    },
    agents: [
      terminalAgent(run, agentDir, "terminal-researcher", "researcher", "Read current repo truth and prior-art implications before plan lock.", {
        network: true,
        searchByDefault: true,
        allowedCommands: ["rg", "sed", "git status --short --branch", "git diff --stat", "git diff --cached --stat", "git diff --cached --name-only"],
        sandboxMode: "read-only",
        defaultLaunch: run.researchRequired
      }),
      terminalAgent(run, agentDir, "terminal-reviewer", "reviewer", "Run a findings-first review of the current lifecycle scope and reports.", {
        allowedCommands: ["rg", "sed", "git status --short --branch", "git diff --stat", "git diff --cached --stat", "git diff --cached --name-only"],
        sandboxMode: "read-only"
      }),
      terminalAgent(run, agentDir, "terminal-verifier", "verifier", "Run or inspect verification gates and report exact pass/fail evidence.", {
        allowedCommands: releaseGateCommands,
        sandboxMode: "workspace-write",
        requiresWriteMode: true,
        defaultLaunch: false
      }),
      terminalAgent(run, agentDir, "terminal-builder", "builder", "Implement the bounded lifecycle slice inside the explicit write scope, then report changes and verification.", {
        writeScope: run.scope,
        allowedCommands: ["npm run validate:lifecycle", "npm test", "npm run build"],
        sandboxMode: "workspace-write",
        requiresWriteMode: true,
        defaultLaunch: false
      })
    ]
  };
}

function terminalAgent(run, agentDir, id, role, objective, options = {}) {
  return {
    id,
    role,
    parentAgentId: "root-supervisor",
    loopId: run.id,
    objective: `${objective} Lifecycle objective: ${run.objective}`,
    readScope: ["README.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "SUPPORT.md", ".github/", "daemon/", "docs/", "scripts/", "src/", "tests/", "package.json", "test-results/ux-audit/report.md", "test-results/ux-audit/report.json", run.artifacts.supervisor, run.artifacts.researchBrief, run.artifacts.planner, run.artifacts.mission, run.artifacts.terminalOrchestrator],
    writeScope: options.writeScope ?? [],
    allowedCommands: options.allowedCommands ?? ["rg", "sed", "git diff --stat"],
    stopCondition: "Return one bounded report with findings, evidence, subagent usage, and residual risks.",
    artifactPath: join(agentDir, `${id}.report.md`),
    promptPath: join(agentDir, `${id}.prompt.md`),
    maySpawnChildren: Boolean(options.maySpawnChildren),
    remainingDepth: options.maySpawnChildren ? (options.remainingDepth ?? 1) : 0,
    network: Boolean(options.network),
    searchByDefault: options.searchByDefault ?? Boolean(options.network),
    daemonActions: false,
    gitWrites: false,
    sandboxMode: options.sandboxMode ?? "read-only",
    requiresWriteMode: Boolean(options.requiresWriteMode),
    defaultLaunch: options.defaultLaunch ?? true
  };
}

function handoffPrompt(run) {
  return [
    "# Second Codex Terminal Handoff",
    "",
    "This is the manual fallback for a human-opened second terminal. For required process-supervised multi-agent mode, use `terminal-orchestrator.md` and `terminal-agents.json`.",
    "",
    "## Suggested Prompt",
    "```text",
    `You are the builder for Cognopticon lifecycle run ${run.id}.`,
    `Objective: ${run.objective}`,
    "",
    "Read these local packet files first:",
    `- ${run.artifacts.mission}`,
    ...(run.researchRequired ? [`- ${run.artifacts.researchBrief}`] : []),
    `- ${run.artifacts.planner}`,
    "",
    "Work only inside the mission scope unless the repo proves a small adjacent edit is required.",
    "Do not edit `.cognopticon/` private state except to write lifecycle reports in this run directory.",
    "Do not run destructive git commands.",
    "After implementation, write your final report into the packet run directory and include changed files, verification commands, residual risks, and any authority you did not use.",
    "Stop if the task conflicts with current git state, public/private data boundaries, or daemon safety.",
    "```",
    "",
    "## Reviewer Prompt",
    "```text",
    `Review Cognopticon lifecycle run ${run.id} findings-first. Read reviewer.md, the diff, research-brief.md, verifier output, and UX evidence. Return blocking findings with file/line refs first, then residual risks.`,
    "```",
    "",
    "## Stop Conditions",
    "- Research brief missing or incomplete while research is required.",
    "- Write scope is ambiguous.",
    "- Public/private boundary is ambiguous.",
    "- Verification cannot be run and no equivalent evidence exists."
  ].join("\n");
}

function finalReportTemplate(run) {
  return [
    "# Cognopticon Lifecycle Final Report",
    "",
    `Run: ${run.id}`,
    `Objective: ${run.objective}`,
    "",
    "## Changed Files",
    "",
    "## Behavior",
    "",
    "## Prior Art",
    ...(run.researchRequired
      ? ["- Sources:", "- License/reuse decision:", "- How research changed the plan:"]
      : [`- Research skipped: ${run.researchSkipReason}`, "- License/reuse decision: no external code or assets approved by this skipped packet.", "- How research changed the plan: not applicable; regenerate with research enabled if direction changes."]),
    "",
    "## Verification",
    "",
    "## UX Audit",
    ...(run.uxRequired
      ? []
      : [`- UX audit skipped: ${run.uxSkipReason}`, "- Frontend acceptance status: no UI changes should be accepted from this packet without a separate browser UX audit."]),
    "",
    "",
    "## Reviewer Findings",
    "",
    "## Integration Decision",
    "",
    "## Residual Risks"
  ].join("\n");
}

function parseList(value) {
  if (!value) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function skipReason(flag, fallback) {
  const value = argValue(flag);
  return value?.trim() || fallback;
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function slug(value) {
  return basename(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lifecycle";
}
