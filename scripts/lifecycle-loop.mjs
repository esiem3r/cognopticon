#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
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
  status: "packet_generated",
  createdAt: new Date().toISOString(),
  artifacts: {
    supervisor: join(runDir, "supervisor.md"),
    researcher: join(runDir, "researcher.md"),
    planner: join(runDir, "planner.md"),
    mission: join(runDir, "mission.md"),
    reviewer: join(runDir, "reviewer.md"),
    verifier: join(runDir, "verifier.md"),
    uxAuditor: join(runDir, "ux-auditor.md"),
    integrator: join(runDir, "integrator.md"),
    finalReport: join(runDir, "final-report.md")
  }
};

writeFileSync(join(runDir, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
writeFileSync(run.artifacts.supervisor, `${supervisorPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.researcher, `${researcherPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.planner, `${plannerPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.mission, `${missionPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.reviewer, `${reviewerPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.verifier, `${verifierPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.uxAuditor, `${uxAuditorPrompt(run)}\n`, "utf8");
writeFileSync(run.artifacts.integrator, `${integratorPrompt(run)}\n`, "utf8");
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
    "2. `planner.md`",
    "3. `mission.md` for builder implementation",
    "4. `reviewer.md`",
    "5. `verifier.md`",
    ...(run.uxRequired ? ["6. `ux-auditor.md`"] : ["6. UX audit disabled for this packet; record why."]),
    "7. `integrator.md`",
    "8. `final-report.md`",
    "",
    "## Acceptance Rule",
    "Do not mark the lifecycle complete until the final report names exact evidence, unresolved risks, and whether the output is accepted, rejected, or needs another loop."
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
    "## Required Output",
    "- Repos/packages found, with links.",
    "- License and compatibility notes. MIT/Apache/BSD are preferred; GPL/AGPL require explicit acceptance; no-license means no copying.",
    "- Maintenance signals: recent commits, releases, tests, docs, issue health.",
    "- What to reuse: dependency, architecture, algorithm, UX pattern, small attributed snippet, or nothing.",
    "- Fit/risk analysis for Cognopticon's local-first, private-profile, daemon-safety, graph-native product model.",
    "- Recommendation for the planner.",
    "",
    "## Constraints",
    "- Do not paste code into the product plan without license/provenance.",
    "- Prefer using a dependency or pattern over vendoring code.",
    "- Treat frontend interaction patterns as prior art too, not only backend libraries."
  ].join("\n");
}

function plannerPrompt(run) {
  return [
    "# Cognopticon Planner",
    "",
    `Planning objective: ${run.objective}`,
    "",
    "Use the research artifact if available. Produce a decision-complete implementation plan for the builder.",
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
    "2. Read the research and planner artifacts if present.",
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
    "- Prior-art/license decisions are documented.",
    "- Final report is specific enough for human review.",
    "",
    "If any item fails, send the work back into another bounded loop instead of calling it complete."
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
