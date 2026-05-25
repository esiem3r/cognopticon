#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig, normalizeProfileId } from "./runtime-config.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const publicDomains = new Set(["agentics", "memory", "research", "visualization", "corpus", "operations", "infrastructure", "writing"]);
const publicStatuses = new Set(["active", "forming", "legacy", "paused", "archive"]);
const publicHealth = new Set(["strong", "promising", "fragile", "stalled", "unknown"]);
const publicDecisions = new Set(["build", "triage", "merge", "pause", "archive"]);

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const summary = runPrivateProfileProof(parseArgs(process.argv.slice(2)));
    const reportDetail = summary.reportPath
      ? `, redacted report ${summary.reportPath}`
      : ", redacted report not written";
    console.log(
      `Cognopticon private profile proof valid: profile ${summary.profileId}, ${summary.rootCount} root(s), ` +
      `${summary.candidateCount} candidate(s), ${summary.projectCount} project(s), ` +
      `${summary.relationshipCount} relationship(s)${reportDetail}.`
    );
  } catch (error) {
    console.error(`Cognopticon private profile proof failed: ${error.message}`);
    process.exit(1);
  }
}

export function runPrivateProfileProof(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const originalProfile = process.env.COGNOPTICON_PROFILE;
  if (options.profile) process.env.COGNOPTICON_PROFILE = normalizeProfileId(options.profile);

  let runtimeConfig;
  try {
    runtimeConfig = loadRuntimeConfig(root, { requireInitialized: true });
  } finally {
    if (options.profile) {
      if (originalProfile === undefined) delete process.env.COGNOPTICON_PROFILE;
      else process.env.COGNOPTICON_PROFILE = originalProfile;
    }
  }

  const profileId = runtimeConfig.profile.id;
  const scanRoots = options.roots?.length
    ? options.roots.map((scanRoot) => resolve(root, scanRoot))
    : runtimeConfig.profile.allowedRoots;
  if (!scanRoots.length) throw new Error(`profile ${profileId} does not declare scan roots`);

  const tempRoot = mkdtempSync(join(tmpdir(), "cognopticon-private-proof-"));
  const rawPath = join(tempRoot, "workspace.raw.json");
  const reviewPath = join(tempRoot, "scan-review.json");
  const workspacePath = join(tempRoot, "workspace.json");
  const criticalBefore = snapshotCriticalState(runtimeConfig);

  try {
    runNodeScript(root, "scripts/scan-workspace.mjs", [
      "--write",
      rawPath,
      "--review",
      reviewPath,
      "--roots",
      scanRoots.join(",")
    ], profileId);
    runNodeScript(root, "scripts/analyze-workspace.mjs", [
      "--input",
      rawPath,
      "--output",
      workspacePath,
      "--enrichments",
      runtimeConfig.profile.paths.enrichments
    ], profileId);

    const criticalAfter = snapshotCriticalState(runtimeConfig);
    assertEqual(criticalAfter, criticalBefore, "private proof must not modify profile config, workspace, review, or event state");

    const raw = readJson(rawPath);
    const review = readJson(reviewPath);
    const workspace = readJson(workspacePath);
    const projectCount = workspace.projects?.length ?? 0;
    if (projectCount <= 0) throw new Error("private proof found no active projects; initialize the profile with project roots or pass --roots");
    if (raw.profile?.id !== profileId) throw new Error(`scan profile mismatch: expected ${profileId}, got ${raw.profile?.id ?? "missing"}`);
    if (workspace.profile?.id !== profileId) throw new Error(`analysis profile mismatch: expected ${profileId}, got ${workspace.profile?.id ?? "missing"}`);

    const report = buildRedactedReport({
      runtimeConfig,
      raw,
      review,
      workspace,
      rootCount: scanRoots.length,
      stateUnchanged: true
    });
    const reportText = `${JSON.stringify(report, null, 2)}\n`;
    assertNoSensitiveStrings(reportText, sensitiveStrings({ runtimeConfig, raw, review, workspace, scanRoots }));

    let reportPath;
    if (options.writeReport !== false) {
      const reportRoot = join(runtimeConfig.profile.paths.rootDir, "proofs");
      reportPath = resolve(root, options.reportPath ?? join(reportRoot, "private-profile-proof.json"));
      if (!isInside(reportPath, reportRoot)) {
        throw new Error(`private proof report path must stay under ${relative(root, reportRoot) || reportRoot}`);
      }
      mkdirSync(dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, reportText, "utf8");
      assertNoSensitiveStrings(readFileSync(reportPath, "utf8"), sensitiveStrings({ runtimeConfig, raw, review, workspace, scanRoots }));
    }

    return {
      profileId,
      rootCount: scanRoots.length,
      candidateCount: raw.candidates?.length ?? 0,
      projectCount,
      relationshipCount: workspace.relationships?.length ?? 0,
      reportPath: reportPath ? relative(root, reportPath) || "." : undefined
    };
  } finally {
    if (!process.env.COGNOPTICON_KEEP_PRIVATE_PROOF) rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function buildRedactedReport({ runtimeConfig, raw, review, workspace, rootCount, stateUnchanged }) {
  const candidates = raw.candidates ?? [];
  const projects = workspace.projects ?? [];
  const relationships = workspace.relationships ?? [];
  return {
    generatedAt: new Date().toISOString(),
    profile: {
      id: runtimeConfig.profile.id,
      rootCount
    },
    scan: {
      candidateCount: candidates.length,
      defaultCandidates: candidates.filter((candidate) => candidate.visibility === "default").length,
      hiddenCandidates: candidates.filter((candidate) => candidate.visibility === "hidden").length,
      needsReviewCandidates: candidates.filter((candidate) => candidate.visibility === "needs_review").length,
      reviewCandidates: review.review?.length ?? raw.review?.length ?? 0
    },
    workspace: {
      projectCount: projects.length,
      relationshipCount: relationships.length,
      domains: countByPublic(projects, (project) => project.domain, publicDomains),
      statuses: countByPublic(projects, (project) => project.status, publicStatuses),
      health: countByPublic(projects, (project) => project.health, publicHealth),
      decisions: countByPublic(projects, (project) => project.decision, publicDecisions),
      source: workspace.analysis?.source ?? "unknown",
      pendingEnrichment: workspace.analysis?.pendingEnrichment ?? 0
    },
    privacy: {
      redactedReport: true,
      privatePathsInReport: false,
      projectNamesInReport: false,
      profileWorkspaceStateUnchanged: stateUnchanged,
      temporaryRawArtifactsDeletedByDefault: true
    }
  };
}

function parseArgs(args) {
  return {
    profile: argValue(args, "--profile"),
    roots: argValue(args, "--roots")?.split(",").map((value) => value.trim()).filter(Boolean),
    reportPath: argValue(args, "--report"),
    writeReport: !args.includes("--no-report")
  };
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function runNodeScript(root, script, args, profileId) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      COGNOPTICON_PROFILE: profileId
    }
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${script} failed with exit code ${result.status}${output ? `\n${output}` : ""}`);
  }
}

function snapshotCriticalState(runtimeConfig) {
  const paths = [
    resolve(repoRoot, ".cognopticon", "config.json"),
    runtimeConfig.profile.paths.rawWorkspace,
    runtimeConfig.profile.paths.workspace,
    runtimeConfig.profile.paths.review,
    runtimeConfig.profile.paths.events
  ];
  return JSON.stringify(paths.map((path) => [path, fileFingerprint(path)]));
}

function fileFingerprint(path) {
  if (!existsSync(path)) return "missing";
  const stat = statSync(path);
  if (stat.isDirectory()) return `dir:${stat.size}`;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sensitiveStrings({ runtimeConfig, raw, review, workspace, scanRoots }) {
  const values = [
    ...scanRoots,
    runtimeConfig.profile.paths.rootDir,
    runtimeConfig.profile.paths.stateDir,
    runtimeConfig.profile.paths.rawWorkspace,
    runtimeConfig.profile.paths.workspace,
    runtimeConfig.profile.paths.review,
    runtimeConfig.profile.paths.events,
    runtimeConfig.daemon?.accessToken,
    ...(raw.roots ?? []),
    ...(raw.candidates ?? []).flatMap((candidate) => [candidate.path, candidate.name, candidate.packageName]),
    ...(raw.review ?? []).flatMap((candidate) => [candidate.path, candidate.name, candidate.packageName]),
    ...(review.review ?? []).flatMap((candidate) => [candidate.path, candidate.name, candidate.packageName]),
    ...(workspace.projects ?? []).flatMap((project) => [
      project.path,
      project.name,
      project.id,
      ...(project.evidence ?? []).map((item) => item.path),
      ...(project.missionConstraints ?? [])
    ])
  ];
  return [...new Set(values.filter((value) => typeof value === "string" && value.length >= 8))];
}

function assertNoSensitiveStrings(text, forbiddenValues) {
  const leaked = forbiddenValues.filter((value) => text.includes(value));
  if (leaked.length) throw new Error(`redacted proof report contains ${leaked.length} private value(s)`);
}

function countBy(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function countByPublic(items, selector, allowedValues) {
  return countBy(items, (item) => {
    const value = selector(item);
    if (typeof value !== "string" || !value) return "unknown";
    return allowedValues.has(value) ? value : "custom";
  });
}

function isInside(target, root) {
  const resolvedTarget = resolve(target);
  const resolvedRoot = resolve(root);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${sep}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message);
}
