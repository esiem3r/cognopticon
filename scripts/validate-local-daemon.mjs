#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createDaemon } from "../daemon/src/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distIndex = join(repoRoot, "dist", "index.html");
const tempRoot = mkdtempSync(join(tmpdir(), "cognopticon-local-daemon-"));
const profileId = "live-daemon-proof";
const secondaryProfileId = "secondary-proof";
const daemonToken = "daemon-proof-token";
const devOrigin = "http://127.0.0.1:5173";
const projectRoot = join(tempRoot, "workspace", "local-daemon-proof");
const secondaryRoot = join(tempRoot, "workspace", "secondary-proof");
const profileRoot = join(tempRoot, ".cognopticon", "profiles", profileId);
const stateDir = join(profileRoot, "state");
const workspacePath = join(stateDir, "workspace.json");
const eventPath = join(stateDir, "events.jsonl");

let daemon;

try {
  assert(existsSync(distIndex), "dist/index.html is missing; run npm run build before npm run validate:daemon");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(join(projectRoot, "tests"), { recursive: true });
  mkdirSync(secondaryRoot, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(projectRoot, "proof.mjs"), "console.log('daemon-proof-ok');\n", "utf8");
  writeFileSync(join(projectRoot, "package.json"), `${JSON.stringify({ scripts: { test: "node proof.mjs" } }, null, 2)}\n`, "utf8");
  writeFileSync(workspacePath, `${JSON.stringify(buildWorkspace(), null, 2)}\n`, "utf8");
  writeFileSync(eventPath, "", "utf8");

  daemon = createDaemon({
    root: repoRoot,
    configPath: false,
    runtimeConfig: buildRuntimeConfig(),
    config: {
      host: "127.0.0.1",
      port: 0,
      allowedCommands: ["node", "npm"],
      allowedOrigins: ["http://local.test"],
      daemon: { accessToken: daemonToken, maxRequestBytes: 4096, maxOutputBytes: 4096 },
      agents: { maxThreads: 1, maxRuntimeMs: 5000 }
    }
  });

  await listen(daemon.server);
  const baseUrl = addressUrl(daemon.server);
  daemon.config.port = Number(new URL(baseUrl).port);

  await assertBuiltAppServed(baseUrl);
  await assertDevOriginTokenPolicy(baseUrl);
  await assertHealth(baseUrl);
  await assertProfiles(baseUrl);
  await assertWorkspace(baseUrl);
  await assertBrowserAppRuntime(baseUrl);
  const job = await assertAllowlistedJob(baseUrl);
  await assertOutsideRootRejected(baseUrl);
  const events = assertEvents(job.id);

  console.log(`Cognopticon local daemon valid: served built app, profile ${profileId}, job ${job.id} completed, ${events.length} daemon events.`);
} finally {
  if (daemon) await closeServer(daemon.server);
  if (!process.env.COGNOPTICON_KEEP_LOCAL_DAEMON_VALIDATION) rmSync(tempRoot, { recursive: true, force: true });
}

function buildWorkspace() {
  return {
    generatedAt: "2026-05-24T00:00:00.000Z",
    title: "Cognopticon Local Daemon Proof",
    analysis: { source: "generated", summary: "Temporary local daemon validation workspace." },
    profile: { id: profileId, label: "Live Daemon Proof" },
    roots: [projectRoot],
    projects: [
      {
        id: "cognopticon",
        name: "Local Daemon Proof",
        path: projectRoot,
        status: "active",
        health: "strong",
        domain: "operations",
        activity: 1,
        substance: 1,
        position: { x: 0, y: 0 },
        purpose: "Exercise the built local daemon path through a temporary validation project.",
        whyItMatters: "The release gate must prove the local runtime can serve the app and run allowlisted work without reading private profiles.",
        currentFriction: "None; this project exists only for release validation.",
        nextMove: "Run the daemon proof command.",
        decision: "build",
        decisionRationale: "Release validation should cover the real daemon bridge.",
        nextReview: "2026-05-24",
        missionConstraints: ["Do not read or write outside the temporary validation root."],
        evidence: [
          { label: "package.json", path: join(projectRoot, "package.json"), kind: "file" },
          { label: "proof script", path: join(projectRoot, "proof.mjs"), kind: "file" }
        ],
        tags: ["validation", "daemon", "tool"],
        analysis: {
          source: "scan",
          confidence: 1,
          signals: ["package.json", "tests", "launch"]
        }
      }
    ],
    relationships: []
  };
}

function buildRuntimeConfig() {
  const profile = {
    id: profileId,
    label: "Live Daemon Proof",
    deviceId: "local-daemon-validator",
    allowedRoots: [projectRoot],
    paths: {
      rootDir: profileRoot,
      stateDir,
      rawWorkspace: join(stateDir, "workspace.raw.json"),
      workspace: workspacePath,
      review: join(stateDir, "scan-review.json"),
      events: eventPath,
      enrichments: join(profileRoot, "enrichments"),
      missions: join(profileRoot, "missions"),
      loops: join(profileRoot, "loops")
    }
  };
  return {
    initialized: true,
    activeProfile: profileId,
    profiles: {
      [profileId]: { id: profileId, label: "Live Daemon Proof", allowedRoots: [projectRoot] },
      [secondaryProfileId]: { id: secondaryProfileId, label: "Secondary Proof", allowedRoots: [secondaryRoot] }
    },
    profile,
    agents: { maxThreads: 1, maxRuntimeMs: 5000 }
  };
}

async function assertBuiltAppServed(baseUrl) {
  const response = await fetch(`${baseUrl}/`);
  const text = await response.text();
  assert(response.status === 200, `daemon app request returned ${response.status}`);
  assert(text.includes("Cognopticon"), "daemon should serve the built Cognopticon app from dist/");
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
  assert(rejectedBody.error === "Cognopticon daemon token is required for this origin", "dev-origin requests should require the daemon token");

  const queryRejected = await fetch(`${baseUrl}/api/health?daemonToken=${encodeURIComponent(daemonToken)}`, { headers: { Origin: devOrigin } });
  const queryRejectedBody = await queryRejected.json();
  assert(queryRejected.status === 500, `dev-origin query-token health returned ${queryRejected.status}`);
  assert(queryRejectedBody.error === "Cognopticon daemon token must be sent in X-Cognopticon-Token header", "query-string daemon tokens should be rejected");

  const accepted = await fetch(`${baseUrl}/api/health`, { headers: daemonAuthHeaders() });
  const acceptedBody = await accepted.json();
  assert(accepted.status === 200, `dev-origin token health returned ${accepted.status}`);
  assert(accepted.headers.get("access-control-allow-origin") === devOrigin, "daemon should echo the trusted token origin");
  assert(acceptedBody.ok === true && acceptedBody.daemon === "cognopticon", "tokened dev-origin health should reach the daemon");
}

async function assertHealth(baseUrl) {
  const response = await fetch(`${baseUrl}/api/health`, { headers: daemonAuthHeaders() });
  const body = await response.json();
  assert(response.status === 200, `daemon health returned ${response.status}`);
  assert(body.ok === true, "daemon health should be ok");
  assert(body.profile?.id === profileId, "daemon health should expose the temporary profile id");
  assert(body.profile?.stateDir === stateDir, "daemon health should point at temporary profile state");
  assert(Array.isArray(body.allowedRoots) && body.allowedRoots.length === 1 && body.allowedRoots[0] === projectRoot, "daemon health should only expose the temporary allowed root");
  assert(body.jobs?.queued === 0 && body.jobs?.running === 0, "daemon health should start with no queued or running jobs");
}

async function assertProfiles(baseUrl) {
  const response = await fetch(`${baseUrl}/api/profiles`, { headers: daemonAuthHeaders() });
  const body = await response.json();
  assert(response.status === 200, `daemon profiles returned ${response.status}`);
  assert(body.activeProfile?.id === profileId, "daemon profiles should expose the active temp profile");
  const profiles = Array.isArray(body.profiles) ? body.profiles : [];
  const profileIds = profiles.map((profile) => profile.id).sort();
  assert(JSON.stringify(profileIds) === JSON.stringify([profileId, secondaryProfileId].sort()), "daemon profiles should list active and secondary profiles");
  const activeProfile = profiles.find((profile) => profile.id === profileId);
  const secondaryProfile = profiles.find((profile) => profile.id === secondaryProfileId);
  assert(activeProfile?.stateDir === stateDir, "active profile should use the temporary profile state dir");
  assert(secondaryProfile?.stateDir !== stateDir, "secondary profile should not reuse active profile state");
}

async function assertWorkspace(baseUrl) {
  const response = await fetch(`${baseUrl}/api/workspace`, { headers: daemonAuthHeaders() });
  const body = await response.json();
  assert(response.status === 200, `daemon workspace returned ${response.status}`);
  assert(body.title === "Cognopticon Local Daemon Proof", "daemon should serve the temporary profile workspace");
  assert(body.analysis?.source === "generated", "daemon workspace should carry generated local evidence");
  assert(body.roots?.[0] === projectRoot, "daemon workspace roots should come from the temporary profile");
  assert(body.projects?.[0]?.path === projectRoot, "daemon workspace projects should come from the temporary profile");
  assert(!JSON.stringify(body).includes("/demo/workspace"), "daemon should not fall back to sanitized demo data when profile state exists");
  assert(!JSON.stringify(body).includes(secondaryRoot), "daemon workspace should not leak secondary profile roots");
}

async function assertBrowserAppRuntime(baseUrl) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const browserMessages = [];
    page.on("console", (message) => browserMessages.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => browserMessages.push(`pageerror: ${error.message}`));
    try {
      await page.goto(`${baseUrl}/#daemonToken=${encodeURIComponent(daemonToken)}`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("universe-canvas").waitFor({ state: "visible" });
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("local daemon proof"));
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("daemon online"));
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("launchport / daemon-ready"));
      assert(!page.url().includes("daemonToken"), "browser app should strip daemon token fragments from the visible URL");
      const workspaceRequests = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("/api/workspace")));
      assert(workspaceRequests.some((name) => name.startsWith(baseUrl)), "browser app should load workspace from the daemon origin");

      await page.getByRole("button", { name: "Run", exact: true }).click();
      await page.waitForFunction(() => document.body.innerText.includes("npm exited 0"));
    } catch (error) {
      const bodyText = await page.locator("body").innerText({ timeout: 1000 }).catch(() => "");
      throw new Error(`browser daemon proof failed: ${error instanceof Error ? error.message : String(error)}\nURL: ${page.url()}\nBody: ${bodyText.slice(0, 1000)}\nConsole: ${browserMessages.slice(-12).join("\n")}`);
    }
  } finally {
    await browser.close();
  }
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
  assert(job.command === "node", "daemon job should preserve command metadata");
  assert(JSON.stringify(job.args) === JSON.stringify(["proof.mjs"]), "daemon job should preserve argument metadata");
  assert(job.stdout.includes("daemon-proof-ok"), "daemon job should capture stdout");
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
  assert(events.some((event) => event.type === "job_output" && event.payload?.jobId === jobId && event.payload?.text?.includes("daemon-proof-ok")), "daemon events should record job stdout");
  const serializedEvents = JSON.stringify(events);
  assert(serializedEvents.includes("Path is outside configured Cognopticon roots."), "daemon events should record redacted policy failures");
  assert(!serializedEvents.includes(repoRoot), "daemon events should not leak the repository path in policy failures");
  return events;
}

async function pollJob(baseUrl, jobId) {
  const encodedJobId = encodeURIComponent(jobId);
  const deadline = Date.now() + 5000;
  let lastJob;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/jobs/${encodedJobId}`);
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
