#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDaemon } from "../daemon/src/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = join(repoRoot, "dist");
const distIndex = join(distRoot, "index.html");
const tempRoot = mkdtempSync(join(tmpdir(), "cognopticon-daemon-config-"));
const profileId = "disk-daemon-proof";
const secondaryProfileId = "disk-secondary-proof";
const projectRoot = join(tempRoot, "workspace", "disk-daemon-proof");
const secondaryRoot = join(tempRoot, "workspace", "disk-secondary-proof");
const profileRoot = join(tempRoot, ".cognopticon", "profiles", profileId);
const stateDir = join(profileRoot, "state");
const workspacePath = join(stateDir, "workspace.json");
const eventPath = join(stateDir, "events.jsonl");
const devOrigin = "http://127.0.0.1:5173";

let daemon;
let daemonToken = "";

try {
  assert(existsSync(distIndex), "dist/index.html is missing; run npm run build before npm run validate:daemon-config");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(secondaryRoot, { recursive: true });
  writeFileSync(join(projectRoot, "proof.mjs"), "console.log('disk-daemon-proof-ok');\n", "utf8");
  writeFileSync(join(projectRoot, "package.json"), `${JSON.stringify({ scripts: { test: "node proof.mjs" } }, null, 2)}\n`, "utf8");
  cpSync(distRoot, join(tempRoot, "dist"), { recursive: true });

  runLocalInit(secondaryProfileId, secondaryRoot);
  runLocalInit(profileId, projectRoot);
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(workspacePath, `${JSON.stringify(buildWorkspace(), null, 2)}\n`, "utf8");
  writeFileSync(eventPath, "", { flag: "a" });
  daemonToken = readLocalConfig().daemon.accessToken;

  daemon = withIsolatedProfileEnv(() => createDaemon({
    root: tempRoot,
    config: {
      port: 0,
      daemon: { maxRequestBytes: 4096, maxOutputBytes: 4096 },
      agents: { maxThreads: 1, maxRuntimeMs: 5000 }
    }
  }));

  await listen(daemon.server);
  const baseUrl = addressUrl(daemon.server);
  daemon.config.port = Number(new URL(baseUrl).port);

  await assertBuiltAppServed(baseUrl);
  await assertDevOriginTokenPolicy(baseUrl);
  await assertHealth(baseUrl);
  await assertProfiles(baseUrl);
  await assertWorkspace(baseUrl);
  const job = await assertAllowlistedJob(baseUrl);
  await assertOutsideRootRejected(baseUrl);
  const events = assertEvents(job.id);

  console.log(`Cognopticon on-disk daemon config valid: profile ${profileId}, job ${job.id} completed, ${events.length} daemon events.`);
} finally {
  if (daemon) await closeServer(daemon.server);
  if (!process.env.COGNOPTICON_KEEP_LOCAL_DAEMON_CONFIG_VALIDATION) rmSync(tempRoot, { recursive: true, force: true });
}

function runLocalInit(profile, root) {
  const result = spawnSync(process.execPath, [
    join(repoRoot, "scripts", "local-init.mjs"),
    "--profile",
    profile,
    "--roots",
    root
  ], {
    cwd: tempRoot,
    encoding: "utf8",
    env: isolatedProfileEnv()
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`local-init failed for ${profile} with exit code ${result.status}`);
  }
}

function withIsolatedProfileEnv(callback) {
  const previousProfile = process.env.COGNOPTICON_PROFILE;
  delete process.env.COGNOPTICON_PROFILE;
  try {
    return callback();
  } finally {
    if (previousProfile === undefined) delete process.env.COGNOPTICON_PROFILE;
    else process.env.COGNOPTICON_PROFILE = previousProfile;
  }
}

function isolatedProfileEnv() {
  const env = { ...process.env };
  delete env.COGNOPTICON_PROFILE;
  return env;
}

function buildWorkspace() {
  return {
    generatedAt: "2026-05-24T00:00:00.000Z",
    title: "Cognopticon On-Disk Daemon Proof",
    analysis: { source: "generated", summary: "Temporary on-disk daemon configuration validation workspace." },
    profile: { id: profileId, label: "Disk Daemon Proof" },
    roots: [projectRoot],
    projects: [
      {
        id: "disk-daemon-proof",
        name: "Disk Daemon Proof",
        path: projectRoot,
        status: "active",
        health: "strong",
        domain: "operations",
        activity: 1,
        substance: 1,
        position: { x: 0, y: 0 },
        purpose: "Exercise daemon startup from a local-init generated .cognopticon/config.json.",
        whyItMatters: "The public local-first path must work from persisted profile config, not only injected test runtime state.",
        currentFriction: "None; this project exists only for release validation.",
        nextMove: "Run the on-disk daemon proof command.",
        decision: "build",
        decisionRationale: "Release validation should cover the real local runtime config path.",
        nextReview: "2026-05-24",
        missionConstraints: ["Keep all daemon work inside the temporary validation root."],
        evidence: [
          { label: "package.json", path: join(projectRoot, "package.json"), kind: "file" },
          { label: "proof script", path: join(projectRoot, "proof.mjs"), kind: "file" }
        ],
        tags: ["validation", "daemon", "config"],
        analysis: {
          source: "scan",
          confidence: 1,
          signals: ["package.json", "tests"]
        }
      }
    ],
    relationships: []
  };
}

function readLocalConfig() {
  return JSON.parse(readFileSync(join(tempRoot, ".cognopticon", "config.json"), "utf8"));
}

async function assertBuiltAppServed(baseUrl) {
  const response = await fetch(`${baseUrl}/`);
  const text = await response.text();
  assert(response.status === 200, `daemon app request returned ${response.status}`);
  assert(text.includes("Cognopticon"), "daemon should serve copied built app from temp dist/");
  const assetPaths = [...text.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((path) => path.startsWith("/assets/"));
  assert(assetPaths.length >= 2, "built app should reference compiled JS and CSS assets");
  for (const assetPath of assetPaths) {
    const assetResponse = await fetch(`${baseUrl}${assetPath}`);
    const assetText = await assetResponse.text();
    assert(assetResponse.status === 200, `daemon asset ${assetPath} returned ${assetResponse.status}`);
    assert(assetText.length > 100, `daemon asset ${assetPath} should not be empty`);
  }
}

async function assertDevOriginTokenPolicy(baseUrl) {
  const rejected = await fetch(`${baseUrl}/api/health`, { headers: { Origin: devOrigin } });
  const rejectedBody = await rejected.json();
  assert(rejected.status === 500, `dev-origin health without token returned ${rejected.status}`);
  assert(rejectedBody.error === "Cognopticon daemon token is required for this origin", "dev-origin requests should require the generated daemon token");

  const queryRejected = await fetch(`${baseUrl}/api/health?daemonToken=${encodeURIComponent(daemonToken)}`, { headers: { Origin: devOrigin } });
  const queryRejectedBody = await queryRejected.json();
  assert(queryRejected.status === 500, `dev-origin query-token health returned ${queryRejected.status}`);
  assert(queryRejectedBody.error === "Cognopticon daemon token must be sent in X-Cognopticon-Token header", "query-string daemon tokens should be rejected");

  const accepted = await fetch(`${baseUrl}/api/health`, { headers: daemonAuthHeaders() });
  const acceptedBody = await accepted.json();
  assert(accepted.status === 200, `dev-origin token health returned ${accepted.status}`);
  assert(accepted.headers.get("access-control-allow-origin") === devOrigin, "daemon should echo the trusted token origin from local config");
  assert(acceptedBody.ok === true && acceptedBody.daemon === "cognopticon", "tokened dev-origin health should reach the daemon");
}

async function assertHealth(baseUrl) {
  const response = await fetch(`${baseUrl}/api/health`, { headers: daemonAuthHeaders() });
  const body = await response.json();
  assert(response.status === 200, `daemon health returned ${response.status}`);
  assert(body.profile?.id === profileId, "daemon health should expose the local-init active profile");
  assert(body.profile?.stateDir === stateDir, "daemon health should point at the temp on-disk profile state");
  assert(Array.isArray(body.allowedRoots) && body.allowedRoots.length === 1 && body.allowedRoots[0] === projectRoot, "daemon health should only expose the active profile allowed root");
  assert(!JSON.stringify(body).includes(repoRoot), "daemon health should not expose the repository root as an allowed runtime root");
}

async function assertProfiles(baseUrl) {
  const response = await fetch(`${baseUrl}/api/profiles`, { headers: daemonAuthHeaders() });
  const body = await response.json();
  assert(response.status === 200, `daemon profiles returned ${response.status}`);
  assert(body.activeProfile?.id === profileId, "daemon profiles should expose the active local-init profile");
  const profiles = Array.isArray(body.profiles) ? body.profiles : [];
  const profileIds = profiles.map((profile) => profile.id).sort();
  assert(JSON.stringify(profileIds) === JSON.stringify([profileId, secondaryProfileId].sort()), "daemon profiles should list both local-init profiles");
  for (const profile of profiles) {
    assert(typeof profile.stateDir === "string" && profile.stateDir.startsWith(tempRoot), `profile ${profile.id} state should remain under temp root`);
    assert(!profile.stateDir.startsWith(repoRoot), `profile ${profile.id} state should not point at the repository .cognopticon state`);
  }
}

async function assertWorkspace(baseUrl) {
  const response = await fetch(`${baseUrl}/api/workspace`, { headers: daemonAuthHeaders() });
  const body = await response.json();
  assert(response.status === 200, `daemon workspace returned ${response.status}`);
  assert(body.title === "Cognopticon On-Disk Daemon Proof", "daemon should serve the active on-disk profile workspace");
  assert(body.roots?.[0] === projectRoot, "daemon workspace roots should come from the active local-init profile");
  assert(body.projects?.[0]?.path === projectRoot, "daemon workspace projects should come from the active local-init profile");
  assert(!JSON.stringify(body).includes("/demo/workspace"), "daemon should not fall back to demo data when active profile state exists");
  assert(!JSON.stringify(body).includes(secondaryRoot), "daemon workspace should not leak the secondary profile root");
  assert(!JSON.stringify(body).includes(repoRoot), "daemon workspace should not expose repository paths");
}

async function assertAllowlistedJob(baseUrl) {
  const createResponse = await postJson(baseUrl, "/api/jobs", {
    cwd: projectRoot,
    command: "node",
    args: ["proof.mjs"],
    timeoutMs: 5000
  });
  const createBody = await createResponse.json();
  assert(createResponse.status === 202, `daemon job create returned ${createResponse.status}`);
  assert(typeof createBody.jobId === "string" && createBody.jobId.startsWith("job:"), "daemon should return a job id");

  const job = await pollJob(baseUrl, createBody.jobId);
  assert(job.status === "completed", `daemon job should complete, got ${job.status}`);
  assert(job.ok === true, "daemon job should be ok");
  assert(job.stdout.includes("disk-daemon-proof-ok"), "daemon job should capture stdout");
  return job;
}

async function assertOutsideRootRejected(baseUrl) {
  const response = await postJson(baseUrl, "/api/jobs", {
    cwd: repoRoot,
    command: "node",
    args: ["scripts/validate-data.mjs"],
    timeoutMs: 5000
  });
  const body = await response.json();
  assert(response.status === 500, `outside-root daemon job returned ${response.status}`);
  assert(body.error === "Path is outside configured Cognopticon roots.", "daemon should redact and reject jobs outside allowed roots");
  assert(!JSON.stringify(body).includes(repoRoot), "outside-root rejection should not leak the repository path");
}

function assertEvents(jobId) {
  const events = readFileSync(eventPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const eventTypes = events.map((event) => event.type);
  for (const type of ["job_queued", "job_started", "job_output", "job_finished", "action_failed"]) {
    assert(eventTypes.includes(type), `daemon events should include ${type}`);
  }
  assert(events.some((event) => event.type === "job_output" && event.payload?.jobId === jobId && event.payload?.text?.includes("disk-daemon-proof-ok")), "daemon events should record job stdout");
  const serializedEvents = JSON.stringify(events);
  assert(serializedEvents.includes("Path is outside configured Cognopticon roots."), "daemon events should record redacted policy failures");
  assert(!serializedEvents.includes(repoRoot), "daemon events should not leak repository paths in policy failures");
  return events;
}

async function pollJob(baseUrl, jobId) {
  const encodedJobId = encodeURIComponent(jobId);
  const deadline = Date.now() + 5000;
  let lastJob;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/jobs/${encodedJobId}`, { headers: daemonAuthHeaders() });
    const body = await response.json();
    assert(response.status === 200, `daemon job lookup returned ${response.status}`);
    lastJob = body.job;
    if (["completed", "failed", "cancelled", "timed_out"].includes(lastJob.status)) return lastJob;
    await delay(50);
  }
  throw new Error(`Timed out waiting for daemon job ${jobId}; last status ${lastJob?.status ?? "unknown"}`);
}

function postJson(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...daemonAuthHeaders() },
    body: JSON.stringify(body)
  });
}

function daemonAuthHeaders() {
  return { Origin: devOrigin, "X-Cognopticon-Token": daemonToken };
}

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}

function addressUrl(server) {
  const address = server.address();
  assert(address && typeof address === "object", "daemon server should expose a TCP address");
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolveClose) => {
    server.close(resolveClose);
    server.closeAllConnections?.();
  });
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
