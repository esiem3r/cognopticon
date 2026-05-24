import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertConstrainedCommand, assertSafeDaemonCommand, buildDefaultConfig, createDaemon, isDestructiveCommand } from "./index.js";

const daemons = [];

afterEach(async () => {
  await Promise.all(daemons.splice(0).map(({ server }) => new Promise((resolveClose) => {
    if (!server.listening) return resolveClose();
    server.close(resolveClose);
  })));
});

describe("cognopticon daemon endpoints", () => {
  it("does not trust common Vite dev origins unless explicitly configured", () => {
    const config = buildDefaultConfig();

    expect(config.allowedOrigins).not.toContain("http://127.0.0.1:5173");
    expect(config.allowedOrigins).not.toContain("http://localhost:5173");
    expect(config.allowedOrigins).toContain("http://127.0.0.1:8787");
  });

  it("requires a daemon token for explicitly allowed dev-server origins", async () => {
    const { url } = await startTestDaemon({
      config: {
        allowedOrigins: ["http://127.0.0.1:5173"],
        daemon: { accessToken: "dev-secret", maxRequestBytes: 4096 }
      }
    });

    const rejected = await fetch(`${url}/api/health`, { headers: { Origin: "http://127.0.0.1:5173" } });
    expect(rejected.status).toBe(500);
    await expect(rejected.json()).resolves.toMatchObject({ error: "Cognopticon daemon token is required for this origin" });

    const accepted = await fetch(`${url}/api/health?daemonToken=dev-secret`, { headers: { Origin: "http://127.0.0.1:5173" } });
    expect(accepted.status).toBe(200);
  });

  it("accepts token-authenticated loopback dev ports without predeclaring every port", async () => {
    const { url } = await startTestDaemon({
      config: {
        allowedOrigins: ["http://127.0.0.1:8787"],
        daemon: { accessToken: "dev-secret", maxRequestBytes: 4096 }
      }
    });

    const preflight = await fetch(`${url}/api/health`, {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:5176", "Access-Control-Request-Headers": "X-Cognopticon-Token" }
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5176");

    const rejected = await fetch(`${url}/api/health`, { headers: { Origin: "http://127.0.0.1:5176" } });
    expect(rejected.status).toBe(500);

    const accepted = await fetch(`${url}/api/health?daemonToken=dev-secret`, { headers: { Origin: "http://127.0.0.1:5176" } });
    expect(accepted.status).toBe(200);
  });

  it("creates an import-safe daemon and reports health from isolated state", async () => {
    const { daemon, url, root } = await startTestDaemon();

    expect(daemon.root).toBe(root);
    const response = await fetch(`${url}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://local.test");
    expect(body).toMatchObject({
      ok: true,
      daemon: "cognopticon",
      host: "127.0.0.1",
      jobs: { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0, timed_out: 0 },
      orchestrator: { sessions: 0, taskEvents: 0 }
    });
    expect(body.allowedRoots).toEqual([root]);
  });

  it("serves tracked split demo fixtures when no profile workspace exists", async () => {
    const { url } = await startTestDaemon();

    const response = await fetch(`${url}/api/workspace`, { headers: { Origin: "http://local.test" } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      title: "Cognopticon Demo Workspace",
      roots: ["/demo/workspace"],
      projects: [{ id: "demo-project", path: "/demo/workspace/demo-project" }],
      relationships: []
    });
  });

  it("runs approved compatibility commands through the injected process runner", async () => {
    const spawn = createSpawnStub({ stdout: "green\n" });
    const { url, root } = await startTestDaemon({ spawn });

    const response = await postJson(url, "/api/actions/run-command", {
      cwd: root,
      command: "npm",
      args: ["run", "test"]
    });
    const body = await response.json();
    const events = readEvents(root);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, actionId: "run-command", stdout: "green\n", stderr: "" });
    expect(spawn.calls).toEqual([{ command: "npm", args: ["run", "test"], options: { cwd: root, shell: false } }]);
    expect(events.map((event) => event.type)).toEqual(["job_queued", "job_started", "job_output", "job_finished"]);
  });

  it("rejects unsafe job requests before spawning a process", async () => {
    const spawn = createSpawnStub();
    const { url, root } = await startTestDaemon({ spawn });
    const outsideRoot = resolve(root, "..");

    const cases = [
      {
        body: { cwd: outsideRoot, command: "npm", args: ["run", "test"] },
        error: /outside configured Cognopticon roots/
      },
      {
        body: { cwd: root, command: "npm", args: ["run", "test", "--force"] },
        error: /Destructive commands/
      },
      {
        body: { cwd: root, command: "node", args: ["-e", "console.log(1)"] },
        error: /node eval\/print/
      },
      {
        body: { cwd: root, command: "node", args: ["../outside.js"] },
        error: /outside configured Cognopticon roots/
      },
      {
        body: { cwd: root, command: "python", args: ["script.py"] },
        error: /not allowlisted/
      }
    ];

    for (const item of cases) {
      const response = await postJson(url, "/api/jobs", item.body);
      const body = await response.json();
      expect(response.status).toBe(500);
      expect(body.error).toMatch(item.error);
    }

    expect(spawn.calls).toEqual([]);
  });

  it("records structured context for actionable daemon failures", async () => {
    const spawn = createSpawnStub();
    const { url, root } = await startTestDaemon({ spawn });

    const response = await postJson(url, "/api/jobs", {
      cwd: root,
      command: "npm",
      args: ["run", "test", "--force"]
    });
    await expect(response.json()).resolves.toMatchObject({ error: "Destructive commands are not supported" });

    const events = readEvents(root);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "action_failed",
      payload: {
        error: "Destructive commands are not supported",
        category: "policy_block",
        action: "daemon_job",
        endpoint: "/api/jobs",
        method: "POST",
        status: 500
      }
    });
    expect(events[0].payload.requestId).toMatch(/^request:/);
    expect(spawn.calls).toEqual([]);
  });

  it("redacts path-bearing policy failures from responses and persisted events", async () => {
    const spawn = createSpawnStub();
    const { url, root } = await startTestDaemon({ spawn });
    const outsideRoot = resolve(root, "..", "private-project");

    const response = await postJson(url, "/api/jobs", {
      cwd: outsideRoot,
      command: "npm",
      args: ["run", "test"]
    });
    const body = await response.json();
    const events = readEvents(root);
    const serializedEvents = JSON.stringify(events);

    expect(response.status).toBe(500);
    expect(body.error).toBe("Path is outside configured Cognopticon roots.");
    expect(JSON.stringify(body)).not.toContain(outsideRoot);
    expect(events[0]).toMatchObject({
      type: "action_failed",
      payload: {
        error: "Path is outside configured Cognopticon roots.",
        category: "policy_block",
        action: "daemon_job",
        endpoint: "/api/jobs"
      }
    });
    expect(serializedEvents).not.toContain(outsideRoot);
    expect(spawn.calls).toEqual([]);
  });

  it("redacts command details from non-allowlisted command failures", async () => {
    const spawn = createSpawnStub();
    const { url, root } = await startTestDaemon({ spawn });
    const command = resolve(root, "..", "private-tool");

    const response = await postJson(url, "/api/jobs", {
      cwd: root,
      command,
      args: []
    });
    const body = await response.json();
    const events = readEvents(root);

    expect(response.status).toBe(500);
    expect(body.error).toBe("Command is not allowlisted.");
    expect(JSON.stringify(body)).not.toContain(command);
    expect(events[0].payload.error).toBe("Command is not allowlisted.");
    expect(JSON.stringify(events)).not.toContain(command);
    expect(spawn.calls).toEqual([]);
  });

  it("rejects unexpected browser origins and oversized request bodies", async () => {
    const spawn = createSpawnStub();
    const { url, root } = await startTestDaemon({ spawn });

    const crossOrigin = await postJson(url, "/api/jobs", {
      cwd: root,
      command: "npm",
      args: ["run", "test"]
    }, { origin: "http://evil.test" });
    expect(crossOrigin.status).toBe(500);
    await expect(crossOrigin.json()).resolves.toMatchObject({ error: "Origin is not allowed: http://evil.test" });

    const tooLarge = await fetch(`${url}/api/orchestrator/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://local.test" },
      body: JSON.stringify({ focusProjectId: "x".repeat(5000), visualizerUrl: "http://127.0.0.1:5173/" })
    });
    expect(tooLarge.status).toBe(500);
    await expect(tooLarge.json()).resolves.toMatchObject({ error: "Request body exceeds 4096 bytes" });
    expect(spawn.calls).toEqual([]);
  });

  it("clamps caller supplied job timeouts to daemon policy", async () => {
    const spawn = createSpawnStub({ stdout: "green\n" });
    const { url, root } = await startTestDaemon({ spawn });

    const response = await postJson(url, "/api/jobs", {
      cwd: root,
      command: "npm",
      args: ["run", "test"],
      timeoutMs: 999999
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.job.timeoutMs).toBe(5000);
  });

  it("resolves URL-encoded job ids when the browser polls job state", async () => {
    const spawn = createSpawnStub({ stdout: "green\n" });
    const { url, root } = await startTestDaemon({ spawn, randomId: () => "encoded" });

    const createResponse = await postJson(url, "/api/jobs", {
      cwd: root,
      command: "npm",
      args: ["run", "test"]
    });
    const createBody = await createResponse.json();
    const lookupResponse = await fetch(`${url}/api/jobs/${encodeURIComponent(createBody.jobId)}`, {
      headers: { Origin: "http://local.test" }
    });
    const lookupBody = await lookupResponse.json();

    expect(lookupResponse.status).toBe(200);
    expect(lookupBody.job.id).toBe(createBody.jobId);
  });

  it("records orchestrator task events only for known sessions", async () => {
    const { url } = await startTestDaemon();

    const orphan = await postJson(url, "/api/orchestrator/task-event", {
      sessionId: "orchestrator:missing",
      taskId: "task-1",
      projectId: "project-1",
      label: "Check release",
      completed: true
    });
    expect(orphan.status).toBe(500);
    await expect(orphan.json()).resolves.toMatchObject({ error: "Unknown orchestrator session: orchestrator:missing" });

    const session = await postJson(url, "/api/orchestrator/session", {
      focusProjectId: "project-1",
      visualizerUrl: "http://127.0.0.1:5173/"
    });
    const sessionBody = await session.json();
    expect(session.status).toBe(200);
    expect(sessionBody.mode).toBe("orchestrator");

    const recorded = await postJson(url, "/api/orchestrator/task-event", {
      sessionId: sessionBody.sessionId,
      taskId: "task-1",
      projectId: "project-1",
      label: "Check release",
      completed: true
    });
    const recordedBody = await recorded.json();

    expect(recorded.status).toBe(200);
    expect(recordedBody.taskEvent).toMatchObject({
      sessionId: sessionBody.sessionId,
      taskId: "task-1",
      projectId: "project-1",
      source: "user_orchestrator",
      completed: true
    });
  });

  it("does not replay historical request-boundary failures in event snapshots", async () => {
    const { url, root } = await startTestDaemon();
    const eventPath = join(root, ".cognopticon", "state", "events.jsonl");
    writeFileSync(eventPath, [
      JSON.stringify({
        id: "daemon:boundary",
        type: "action_failed",
        payload: { error: "Origin is not allowed: http://127.0.0.1:5176" },
        createdAt: "2026-05-22T12:00:00.000Z"
      }),
      JSON.stringify({
        id: "daemon:policy",
        type: "action_failed",
        payload: { error: "node eval/print commands are not supported", category: "policy_block", action: "daemon_job" },
        createdAt: "2026-05-22T12:00:01.000Z"
      }),
      JSON.stringify({
        id: "daemon:path",
        type: "action_failed",
        payload: { error: "Path is outside configured Cognopticon roots: /home/user/private/project", category: "policy_block", action: "daemon_job" },
        createdAt: "2026-05-22T12:00:01.500Z"
      }),
      JSON.stringify({
        id: "daemon:session",
        type: "orchestrator_session_started",
        payload: { sessionId: "orchestrator:1", message: "armed" },
        createdAt: "2026-05-22T12:00:02.000Z"
      })
    ].join("\n") + "\n");

    const response = await fetch(`${url}/api/events`, { headers: { Origin: "http://local.test" } });
    const snapshot = await readSseSnapshot(response);

    expect(snapshot).toHaveLength(3);
    expect(snapshot.join("\n")).not.toContain("Origin is not allowed");
    expect(snapshot.join("\n")).not.toContain("/home/user/private/project");
    expect(snapshot.join("\n")).toContain("Path is outside configured Cognopticon roots.");
    expect(snapshot.join("\n")).toContain("node eval/print commands are not supported");
    expect(snapshot.join("\n")).toContain("orchestrator_session_started");
  });

  it("serves active profile state without falling back to legacy global workspace data", async () => {
    const root = mkdtempSync(join(tmpdir(), "cognopticon-profile-daemon-"));
    mkdirSync(join(root, "src", "data"), { recursive: true });
    mkdirSync(join(root, ".cognopticon", "state"), { recursive: true });
    mkdirSync(join(root, ".cognopticon", "profiles", "laptop", "state"), { recursive: true });
    writeDemoFixtures(root);
    writeFileSync(join(root, ".cognopticon", "state", "workspace.json"), JSON.stringify({ title: "Legacy leak", roots: ["/legacy"], projects: [], relationships: [] }));
    writeFileSync(join(root, ".cognopticon", "config.json"), JSON.stringify({
      activeProfile: "laptop",
      profiles: {
        laptop: { id: "laptop", label: "Laptop", allowedRoots: [root] },
        desktop: { id: "desktop", label: "Desktop", allowedRoots: [root] }
      }
    }));

    const daemon = createDaemon({
      root,
      config: {
        host: "127.0.0.1",
        port: 0,
        allowedOrigins: ["http://local.test"],
        daemon: { maxRequestBytes: 4096 },
        agents: { maxThreads: 1, maxRuntimeMs: 5000 }
      },
      spawn: createSpawnStub(),
      now: () => "2026-05-22T12:00:00.000Z",
      randomId: createDeterministicIds()
    });
    await new Promise((resolveListen) => daemon.server.listen(0, "127.0.0.1", resolveListen));
    daemons.push(daemon);
    const address = daemon.server.address();
    const url = `http://127.0.0.1:${address.port}`;

    const workspace = await fetch(`${url}/api/workspace`, { headers: { Origin: "http://local.test" } });
    await expect(workspace.json()).resolves.toMatchObject({ title: "Cognopticon Demo Workspace", roots: ["/demo/workspace"] });

    const profiles = await fetch(`${url}/api/profiles`, { headers: { Origin: "http://local.test" } });
    const body = await profiles.json();
    const stateDirs = Object.fromEntries(body.profiles.map((profile) => [profile.id, profile.stateDir]));
    expect(stateDirs.laptop).toContain(join(".cognopticon", "profiles", "laptop", "state"));
    expect(stateDirs.desktop).toContain(join(".cognopticon", "profiles", "desktop", "state"));
    expect(stateDirs.desktop).not.toBe(stateDirs.laptop);
  });
});

describe("daemon command safety policy", () => {
  it("keeps destructive markers blocked even on otherwise allowlisted commands", () => {
    const config = {
      allowedCommands: ["npm", "node"],
      allowedRoots: ["/tmp/cognopticon-safe-root"],
      allowedNpmScripts: ["test"]
    };

    expect(isDestructiveCommand("npm", ["run", "test", "--force"])).toBe(true);
    expect(() => assertSafeDaemonCommand("npm", ["run", "test", "--force"], config.allowedRoots[0], config)).toThrow(/Destructive commands/);
    expect(() => assertSafeDaemonCommand("node", ["-p", "process.cwd()"], config.allowedRoots[0], config)).toThrow(/node eval\/print/);
    expect(() => assertSafeDaemonCommand("npm", ["run", "test"], config.allowedRoots[0], config)).not.toThrow();
  });

  it("keeps default command policy verification-shaped", () => {
    const config = {
      allowedCommands: ["npm", "node"],
      allowedRoots: ["/tmp/cognopticon-safe-root"]
    };

    expect(() => assertConstrainedCommand("npm", ["run", "validate:data"], config.allowedRoots[0], config)).not.toThrow();
    expect(() => assertConstrainedCommand("npm", ["run", "build"], config.allowedRoots[0], config)).toThrow(/approved verification script/);
    expect(() => assertConstrainedCommand("node", ["scripts/validate-data.mjs"], config.allowedRoots[0], config)).not.toThrow();
    expect(() => assertConstrainedCommand("node", ["-e", "console.log(1)"], config.allowedRoots[0], config)).toThrow(/node eval\/print/);
    expect(() => assertConstrainedCommand("node", ["../outside.js"], config.allowedRoots[0], config)).toThrow(/outside configured Cognopticon roots/);
  });
});

async function startTestDaemon(options = {}) {
  const root = mkdtempSync(join(tmpdir(), "cognopticon-daemon-"));
  writeDemoFixtures(root);
  const daemon = createDaemon({
    root,
    configPath: false,
    config: {
      host: "127.0.0.1",
      port: 0,
      allowedRoots: [root],
      allowedCommands: ["npm", "node"],
      allowedOrigin: "http://local.test",
      allowedOrigins: ["http://local.test"],
      daemon: { maxRequestBytes: 4096 },
      agents: { maxThreads: 1, maxRuntimeMs: 5000 },
      ...(options.config ?? {})
    },
    spawn: options.spawn ?? createSpawnStub(),
    now: () => "2026-05-22T12:00:00.000Z",
    randomId: createDeterministicIds()
  });
  await new Promise((resolveListen) => daemon.server.listen(0, "127.0.0.1", resolveListen));
  daemons.push(daemon);
  const address = daemon.server.address();
  return { daemon, root, url: `http://127.0.0.1:${address.port}` };
}

function writeDemoFixtures(root) {
  const dataRoot = join(root, "src", "data");
  mkdirSync(dataRoot, { recursive: true });
  writeFileSync(join(dataRoot, "workspace-meta.json"), JSON.stringify({
    generatedAt: "2026-05-21T00:00:00.000Z",
    title: "Cognopticon Demo Workspace",
    analysis: { source: "sample", summary: "Test demo fallback" }
  }));
  writeFileSync(join(dataRoot, "workspace-roots.json"), JSON.stringify(["/demo/workspace"]));
  writeFileSync(join(dataRoot, "projects.json"), JSON.stringify([{ id: "demo-project", path: "/demo/workspace/demo-project" }]));
  writeFileSync(join(dataRoot, "relationships.json"), JSON.stringify([]));
}

function createSpawnStub({ stdout = "", stderr = "", code = 0 } = {}) {
  const calls = [];
  const stub = vi.fn((command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn((signal = "SIGTERM") => {
      setImmediate(() => child.emit("close", null, signal));
      return true;
    });
    child.unref = vi.fn();
    calls.push({ command, args, options });
    setImmediate(() => {
      if (stdout) child.stdout.write(stdout);
      if (stderr) child.stderr.write(stderr);
      child.stdout.end();
      child.stderr.end();
      child.emit("close", code, null);
    });
    return child;
  });
  stub.calls = calls;
  return stub;
}

function createDeterministicIds() {
  let id = 0;
  return () => `id${id += 1}`;
}

function postJson(baseUrl, path, body, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(options.origin ? { Origin: options.origin } : {}) },
    body: JSON.stringify(body)
  });
}

function readEvents(root) {
  const eventText = readFileSync(join(root, ".cognopticon", "state", "events.jsonl"), "utf8").trim();
  return eventText ? eventText.split("\n").map((line) => JSON.parse(line)) : [];
}

async function readSseSnapshot(response) {
  expect(response.status).toBe(200);
  expect(response.body).not.toBeNull();
  const reader = response.body.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  const text = Buffer.from(value).toString("utf8");
  const match = text.match(/event: snapshot\ndata: (.*)\n\n/);
  expect(match).not.toBeNull();
  return JSON.parse(match[1]);
}
