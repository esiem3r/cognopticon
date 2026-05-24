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
  phaseOrder: [
    "supervisor",
    ...(researchRequired ? ["researcher", "research_brief"] : []),
    "planner",
    "mission",
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
    "- Require reviewer, verifier, and UX-auditor evidence before accepting changes.",
    "- Reject outputs that are first-working, demo-only, frontend-sloppy, privacy-risky, or insufficiently verified.",
    "- Integrate only after blocking findings are resolved.",
    "",
    "## Packet Order",
    ...(run.researchRequired ? ["1. `researcher.md`"] : ["1. Research disabled for this packet; record why."]),
    ...(run.researchRequired ? ["2. `research-brief.md` plan-lock evidence"] : []),
    "3. `planner.md`",
    "4. `mission.md` for builder implementation",
    "5. `reviewer.md`",
    "6. `verifier.md`",
    ...(run.uxRequired ? ["7. `ux-auditor.md`"] : ["7. UX audit disabled for this packet; record why."]),
    "8. `integrator.md`",
    "9. `handoff.md` for second-terminal delegation when useful",
    "10. `final-report.md`",
    "",
    "## Acceptance Rule",
    "Do not mark the lifecycle complete until the final report names exact evidence, unresolved risks, and whether the output is accepted, rejected, or needs another loop.",
    "",
    "## Required Evidence Trail",
    "- `research-brief.md` names source links, license decisions, maintenance signals, and reuse choices before plan lock.",
    "- `planner.md` records how research changed the plan or why no reuse was chosen.",
    "- Reviewer and verifier outputs name exact files, commands, and outcomes.",
    "- `handoff.md` remains a bounded packet for a second Codex terminal rather than a broad project mandate."
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
    "",
    "## Constraints",
    "- Do not paste code into the product plan without license/provenance.",
    "- Prefer using a dependency or pattern over vendoring code.",
    "- Treat frontend interaction patterns as prior art too, not only backend libraries.",
    "- If network research is unavailable, record the exact blocker and use locally cached docs only as provisional evidence."
  ].join("\n");
}

function researchBriefTemplate(run) {
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
      : "Research was disabled for this packet; record the reason before planning.",
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
    "- Work only inside the requested scope unless the repo proves a small adjacent edit is required.",
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
    "2. Read `research-brief.md` and `planner.md` if present; stop if the plan is locked without required research.",
    "3. Implement the slice completely.",
    "4. Run the verification gates that apply.",
    "5. Hand the changed files and verification output to an independent reviewer.",
    "6. Revise until the reviewer has no blocking findings.",
    "7. Produce the final report.",
    "",
    "## Verification Gates",
    ...run.gates.map((gate) => `- ${gate}`),
    "",
    "## Final Report Must Include",
    "- Changed files",
    "- Product behavior added or repaired",
    "- Prior-art sources used and reuse/license decisions",
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
    "Read builder, reviewer, verifier, UX auditor, and research artifacts. Decide whether to accept, revise, or reject the loop output.",
    "",
    "## Integration Checklist",
    "- Blocking reviewer findings resolved.",
    "- Verification gates passed or blockers are environmental and documented.",
    "- UX audit passed for touched surfaces.",
    "- Release/privacy hygiene passed.",
    "- Public/demo mode and private profile mode remain separated.",
    "- Prior-art/license decisions are documented in `research-brief.md` and reflected in the plan.",
    "- Final report is specific enough for human review.",
    "",
    "If any item fails, send the work back into another bounded loop instead of calling it complete."
  ].join("\n");
}

function handoffPrompt(run) {
  return [
    "# Second Codex Terminal Handoff",
    "",
    "Open a second terminal in the same repository and start Codex with this bounded packet.",
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
    "- Sources:",
    "- License/reuse decision:",
    "- How research changed the plan:",
    "",
    "## Verification",
    "",
    "## UX Audit",
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

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function slug(value) {
  return basename(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lifecycle";
}
