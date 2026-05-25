import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertConstrainedCommand, assertSafeDaemonCommand, buildDefaultConfig, createDaemon, isDestructiveCommand, openPathSpawnSpec } from "./index.js";

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

    const queryRejected = await fetch(`${url}/api/health?daemonToken=dev-secret`, { headers: { Origin: "http://127.0.0.1:5173" } });
    expect(queryRejected.status).toBe(500);
    await expect(queryRejected.json()).resolves.toMatchObject({ error: "Cognopticon daemon token must be sent in X-Cognopticon-Token header" });

    const daemonOriginQueryRejected = await fetch(`${url}/api/health?daemonToken=dev-secret`);
    expect(daemonOriginQueryRejected.status).toBe(500);
    await expect(daemonOriginQueryRejected.json()).resolves.toMatchObject({ error: "Cognopticon daemon token must be sent in X-Cognopticon-Token header" });

    const accepted = await fetch(`${url}/api/health`, { headers: { Origin: "http://127.0.0.1:5173", "X-Cognopticon-Token": "dev-secret" } });
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

    const accepted = await fetch(`${url}/api/health`, { headers: { Origin: "http://127.0.0.1:5176", "X-Cognopticon-Token": "dev-secret" } });
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
      runtimeMode: "local_daemon",
      allowedRootCount: 1,
      jobs: { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0, timed_out: 0 },
      orchestrator: { sessions: 0, taskEvents: 0 }
    });
    expect(body).not.toHaveProperty("allowedRoots");
    expect(JSON.stringify(body)).not.toContain(root);
  });

  it("reports sanitized profile identity in daemon health without roots or state paths", async () => {
    const { url, root } = await startTestDaemon({
      config: {
        profile: {
          id: "laptop",
          label: "Laptop /home/user/private",
          deviceId: "local-device",
          stateDir: "/home/user/.cognopticon/state"
        }
      }
    });

    const response = await fetch(`${url}/api/health`);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.profile).toMatchObject({
      id: "laptop",
      label: "Laptop [redacted path]",
      deviceId: "local-device"
    });
    expect(body.profile).not.toHaveProperty("stateDir");
    expect(body).not.toHaveProperty("allowedRoots");
    expect(body.allowedRootCount).toBe(1);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain("/home/user");
  });

  it("serves tracked split demo fixtures when no profile workspace exists", async () => {
    const { url, root } = await startTestDaemon();
    mkdirSync(join(root, ".cognopticon", "state"), { recursive: true });
    mkdirSync(join(root, "public"), { recursive: true });
    writeFileSync(join(root, ".cognopticon", "state", "workspace.json"), JSON.stringify({ title: "Legacy global state", roots: ["/private"], projects: [], relationships: [] }));
    writeFileSync(join(root, "public", "workspace.json"), JSON.stringify({ title: "Public generated state", roots: ["/private-public"], projects: [], relationships: [] }));

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

  it("refuses default daemon startup before local init", () => {
    const root = mkdtempSync(join(tmpdir(), "cognopticon-uninitialized-daemon-"));

    expect(() => createDaemon({
      root,
      config: {
        host: "127.0.0.1",
        port: 0,
        allowedOrigins: ["http://local.test"],
        daemon: { maxRequestBytes: 4096 },
        agents: { maxThreads: 1, maxRuntimeMs: 5000 }
      }
    })).toThrow(/Cognopticon local profile is not initialized/);
  });

  it("honors a custom configPath during profile runtime initialization", () => {
    const root = mkdtempSync(join(tmpdir(), "cognopticon-custom-config-"));
    const projectRoot = join(root, "workspace");
    const configPath = join(root, "alt", "cognopticon.json");
    mkdirSync(join(root, "alt"), { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      activeProfile: "laptop",
      profiles: {
        laptop: { id: "laptop", label: "Laptop", allowedRoots: [projectRoot] }
      },
      allowedOrigins: ["http://local.test"]
    }));

    const daemon = createDaemon({
      root,
      configPath,
      config: {
        host: "127.0.0.1",
        port: 0,
        daemon: { maxRequestBytes: 4096 },
        agents: { maxThreads: 1, maxRuntimeMs: 5000 }
      }
    });

    expect(daemon.config.profile).toMatchObject({ id: "laptop", label: "Laptop" });
    expect(daemon.config.allowedRoots).toEqual([projectRoot]);
  });

  it("runs approved compatibility commands through the injected process runner", async () => {
    const spawn = createSpawnStub({
      stdout: ({ options }) => `green ${join(options.cwd, "private-stdout.txt")}\n`,
      stderr: ({ options }) => `warn ${join(options.cwd, "private-stderr.txt")}\n`
    });
    const { url, root } = await startTestDaemon({ spawn });

    const response = await postJson(url, "/api/actions/run-command", {
      cwd: root,
      command: "npm",
      args: ["run", "test"]
    });
    const body = await response.json();
    const events = readEvents(root);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, actionId: "run-command" });
    expect(body.stdout).toContain("green [redacted path]");
    expect(body.stderr).toContain("warn [redacted path]");
    expect(JSON.stringify(body)).not.toContain(root);
    expect(JSON.stringify(body)).not.toContain("private-stdout.txt");
    expect(JSON.stringify(body)).not.toContain("private-stderr.txt");
    expect(spawn.calls).toEqual([{ command: "npm", args: ["run", "test"], options: { cwd: root, shell: false } }]);
    expect(events.map((event) => event.type)).toEqual(["job_queued", "job_started", "job_output", "job_output", "job_finished"]);
  });

  it("redacts successful job event payloads before persisting and streaming", async () => {
    let privatePath = "";
    const diagnosticPath = join(tmpdir(), "outside-diagnostics", "secret.txt");
    const windowsPath = "C:\\Users\\User\\secret.txt";
    const spawn = createSpawnStub({
      stdout: ({ options }) => {
        privatePath = join(options.cwd, "private project", "secret.txt");
        return `green ${privatePath}\ncwd:${diagnosticPath}\nfile://${diagnosticPath}\n`;
      },
      stderr: `warn ${windowsPath}\n`
    });
    const { url, root } = await startTestDaemon({ spawn });
    const liveResponse = await fetch(`${url}/api/events`, { headers: { Origin: "http://local.test" } });
    const liveEvents = readSseUntil(liveResponse, (text) => text.includes("event: job_finished"));

    const createResponse = await postJson(url, "/api/jobs", {
      cwd: root,
      command: "npm",
      args: ["run", "test"]
    });
    const createBody = await createResponse.json();
    const job = await pollJob(url, createBody.jobId);
    const serializedJob = JSON.stringify(job);
    const liveText = await liveEvents;
    const events = readEvents(root);
    const serializedEvents = JSON.stringify(events);

    expect(job).not.toHaveProperty("cwd");
    expect(job).not.toHaveProperty("stdout");
    expect(job).not.toHaveProperty("stderr");
    expect(serializedJob).not.toContain(root);
    expect(serializedJob).not.toContain(privatePath);
    expect(serializedJob).not.toContain(diagnosticPath);
    expect(serializedJob).not.toContain(windowsPath);
    expect(serializedEvents).not.toContain(root);
    expect(serializedEvents).not.toContain(privatePath);
    expect(serializedEvents).not.toContain(diagnosticPath);
    expect(serializedEvents).not.toContain(windowsPath);
    expect(liveText).not.toContain(root);
    expect(liveText).not.toContain(privatePath);
    expect(liveText).not.toContain(diagnosticPath);
    expect(liveText).not.toContain(windowsPath);

    const jobOutput = events.filter((event) => event.type === "job_output");
    expect(jobOutput.map((event) => event.payload.text).join("\n")).toContain("[redacted path]");
    for (const event of events.filter((item) => item.type.startsWith("job_") && item.type !== "job_output")) {
      expect(event.payload).not.toHaveProperty("cwd");
      expect(event.payload).not.toHaveProperty("stdout");
      expect(event.payload).not.toHaveProperty("stderr");
    }
  });

  it("bounds persisted and streamed job output event payloads", async () => {
    const longOutput = `${"a".repeat(96)}tail-marker\n`;
    const spawn = createSpawnStub({ stdout: longOutput });
    const { url, root } = await startTestDaemon({
      spawn,
      config: { daemon: { maxOutputBytes: 64, maxEventOutputBytes: 16 } }
    });
    const liveResponse = await fetch(`${url}/api/events`, { headers: { Origin: "http://local.test" } });
    const liveEvents = readSseUntil(liveResponse, (text) => text.includes("event: job_finished"));

    const createResponse = await postJson(url, "/api/jobs", {
      cwd: root,
      command: "npm",
      args: ["run", "test"]
    });
    const createBody = await createResponse.json();
    const job = await pollJob(url, createBody.jobId);
    const liveText = await liveEvents;
    const outputEvents = readEvents(root).filter((event) => event.type === "job_output");

    expect(job.outputTruncated).toBe(true);
    expect(outputEvents).toHaveLength(1);
    expect(Buffer.byteLength(outputEvents[0].payload.text)).toBeLessThanOrEqual(16);
    expect(outputEvents[0].payload.truncated).toBe(true);
    expect(JSON.stringify(outputEvents)).not.toContain("tail-marker");
    expect(liveText).not.toContain("tail-marker");
    expect(liveText).toContain("\"truncated\":true");
  });

  it("redacts opened paths from persisted action events", async () => {
    const spawn = createSpawnStub();
    const { url, root } = await startTestDaemon({ spawn });
    const target = join(root, "nested", "private-file.txt");

    const response = await postJson(url, "/api/actions/open-path", { path: target });
    const body = await response.json();
    const editorResponse = await postJson(url, "/api/actions/open-editor", { path: target });
    const editorBody = await editorResponse.json();
    const events = readEvents(root);
    const serializedEvents = JSON.stringify(events);

    expect(response.status).toBe(200);
    expect(body.eventId).toMatch(/^daemon:/);
    expect(body.message).toBe("Opened allowed local path.");
    expect(JSON.stringify(body)).not.toContain(root);
    expect(JSON.stringify(body)).not.toContain(target);
    expect(editorResponse.status).toBe(200);
    expect(editorBody.message).toBe("Opened configured editor for allowed local path.");
    expect(JSON.stringify(editorBody)).not.toContain(root);
    expect(JSON.stringify(editorBody)).not.toContain(target);
    expect(serializedEvents).not.toContain(root);
    expect(serializedEvents).not.toContain(target);
    expect(events).toEqual([
      expect.objectContaining({
        type: "file_opened",
        payload: expect.objectContaining({ path: "[redacted path]" })
      }),
      expect.objectContaining({
        type: "file_opened",
        payload: expect.objectContaining({ path: "[redacted path]", editor: "code" })
      })
    ]);
  });

  it("opens local paths through platform launchers without shell-mediated command strings", async () => {
    const pathWithShellMetacharacters = "C:\\Users\\User\\Project & secret\\file.txt";

    expect(openPathSpawnSpec(pathWithShellMetacharacters, "win32")).toEqual({
      command: "explorer.exe",
      args: [pathWithShellMetacharacters]
    });
    expect(openPathSpawnSpec("/Users/user/Project & secret/file.txt", "darwin")).toEqual({
      command: "open",
      args: ["/Users/user/Project & secret/file.txt"]
    });
    expect(openPathSpawnSpec("/home/user/Project & secret/file.txt", "linux")).toEqual({
      command: "xdg-open",
      args: ["/home/user/Project & secret/file.txt"]
    });
    expect(JSON.stringify(openPathSpawnSpec(pathWithShellMetacharacters, "win32"))).not.toContain("cmd.exe");
    expect(JSON.stringify(openPathSpawnSpec(pathWithShellMetacharacters, "win32"))).not.toContain("/c");
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
    expect(body.job).not.toHaveProperty("cwd");
    expect(body.job).not.toHaveProperty("stdout");
    expect(body.job).not.toHaveProperty("stderr");
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
    expect(lookupBody.job).not.toHaveProperty("cwd");
    expect(lookupBody.job).not.toHaveProperty("stdout");
    expect(lookupBody.job).not.toHaveProperty("stderr");
    expect(JSON.stringify(lookupBody)).not.toContain(root);
  });

  it("projects live daemon jobs as bounded run records with caller metadata", async () => {
    const spawn = createSpawnStub({ stdout: "green\n" });
    const { url, root } = await startTestDaemon({ spawn });

    const createResponse = await postJson(url, "/api/jobs", {
      runId: "verify:demo-project",
      projectId: "demo-project",
      title: "Demo Project verification",
      cwd: root,
      command: "npm",
      args: ["run", "test"]
    });
    const createBody = await createResponse.json();
    await pollJob(url, createBody.jobId);

    const stateResponse = await fetch(`${url}/api/runs/state`, { headers: { Origin: "http://local.test" } });
    const stateBody = await stateResponse.json();
    const events = readEvents(root);

    expect(stateResponse.status).toBe(200);
    expect(stateBody.runs[0]).toMatchObject({
      id: "verify:demo-project",
      projectId: "demo-project",
      title: "Demo Project verification",
      status: "completed",
      command: "npm run test",
      jobId: createBody.jobId
    });
    expect(stateBody.jobs[0]).toMatchObject({
      id: createBody.jobId,
      runId: "verify:demo-project",
      projectId: "demo-project",
      title: "Demo Project verification",
      status: "completed"
    });
    expect(stateBody.jobs[0].events.map((event) => event.type)).toEqual(["job_queued", "job_started", "job_output", "job_finished"]);
    expect(stateBody.jobs[0].events.find((event) => event.type === "job_output")).toMatchObject({
      summary: "stdout output observed",
      stream: "stdout",
      truncated: false
    });
    expect(events[0].payload).toMatchObject({
      runId: "verify:demo-project",
      projectId: "demo-project",
      title: "Demo Project verification"
    });
    expect(stateBody.jobs[0]).not.toHaveProperty("cwd");
    expect(stateBody.jobs[0]).not.toHaveProperty("stdout");
    expect(stateBody.jobs[0]).not.toHaveProperty("stderr");
  });

  it("hydrates sanitized daemon run state from persisted job events", async () => {
    const root = mkdtempSync(join(tmpdir(), "cognopticon-run-state-"));
    const stateDir = join(root, ".cognopticon", "state");
    mkdirSync(stateDir, { recursive: true });
    writeDemoFixtures(root);
    writeFileSync(join(stateDir, "events.jsonl"), [
      JSON.stringify({
        id: "daemon:queued",
        type: "job_queued",
        payload: {
          id: "job:completed",
          runId: "verify:launchable-tool",
          projectId: "launchable-tool",
          title: `Verify launchable tool ${join(root, "private-title.txt")}`,
          cwd: root,
          command: "npm",
          args: ["run", "test"],
          status: "queued",
          ok: false,
          stdout: join(root, "private-stdout.txt"),
          stderr: "",
          createdAt: "2026-05-24T12:00:00.000Z",
          updatedAt: "2026-05-24T12:00:00.000Z",
          timeoutMs: 5000
        },
        createdAt: "2026-05-24T12:00:00.000Z"
      }),
      JSON.stringify({
        id: "daemon:finished",
        type: "job_finished",
        payload: {
          id: "job:completed",
          runId: "verify:launchable-tool",
          projectId: "launchable-tool",
          title: `Verify launchable tool ${join(root, "private-title.txt")}`,
          cwd: root,
          command: "npm",
          args: ["run", "test"],
          status: "completed",
          ok: true,
          exitCode: 0,
          stdout: join(root, "private-stdout.txt"),
          stderr: "",
          createdAt: "2026-05-24T12:00:00.000Z",
          startedAt: "2026-05-24T12:00:01.000Z",
          completedAt: "2026-05-24T12:00:03.000Z",
          updatedAt: "2026-05-24T12:00:03.000Z",
          timeoutMs: 5000
        },
        createdAt: "2026-05-24T12:00:03.000Z"
      }),
      JSON.stringify({
        id: "daemon:output",
        type: "job_output",
        payload: {
          jobId: "job:completed",
          stream: "stdout",
          text: `proof output from ${join(root, "private-output.txt")}`,
          truncated: false
        },
        createdAt: "2026-05-24T12:00:02.000Z"
      }),
      JSON.stringify({
        id: "daemon:started",
        type: "job_started",
        payload: {
          id: "job:interrupted",
          runId: "launch:launchable-tool:1",
          projectId: "launchable-tool",
          title: `Launch ${join(root, "private-launch.txt")}`,
          cwd: root,
          command: "npm",
          args: ["run", "test"],
          status: "running",
          ok: false,
          createdAt: "2026-05-24T12:10:00.000Z",
          startedAt: "2026-05-24T12:10:01.000Z",
          updatedAt: "2026-05-24T12:10:01.000Z",
          timeoutMs: 5000
        },
        createdAt: "2026-05-24T12:10:01.000Z"
      })
    ].join("\n") + "\n");

    const daemon = createDaemon({
      root,
      configPath: false,
      config: {
        host: "127.0.0.1",
        port: 0,
        allowedRoots: [root],
        allowedOrigins: ["http://local.test"],
        daemon: { maxRequestBytes: 4096 },
        agents: { maxThreads: 1, maxRuntimeMs: 5000 }
      },
      spawn: createSpawnStub(),
      now: () => "2026-05-24T12:20:00.000Z",
      randomId: createDeterministicIds()
    });
    await new Promise((resolveListen) => daemon.server.listen(0, "127.0.0.1", resolveListen));
    daemons.push(daemon);
    const address = daemon.server.address();
    const url = `http://127.0.0.1:${address.port}`;

    const stateResponse = await fetch(`${url}/api/runs/state`, { headers: { Origin: "http://local.test" } });
    const stateBody = await stateResponse.json();
    const stateText = JSON.stringify(stateBody);

    expect(stateResponse.status).toBe(200);
    expect(stateBody.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "verify:launchable-tool",
        projectId: "launchable-tool",
        status: "completed",
        command: "npm run test",
        jobId: "job:completed"
      }),
      expect.objectContaining({
        id: "launch:launchable-tool:1",
        projectId: "launchable-tool",
        status: "failed",
        summary: "Daemon restarted before this job reached a terminal event.",
        jobId: "job:interrupted"
      })
    ]));
    expect(stateBody.jobs.find((job) => job.id === "job:interrupted")).toMatchObject({
      status: "failed",
      interrupted: true,
      error: "Daemon restarted before this job reached a terminal event."
    });
    expect(stateBody.jobs.find((job) => job.id === "job:completed").events).toEqual([
      expect.objectContaining({ type: "job_queued", summary: "Queued npm run test" }),
      expect.objectContaining({ type: "job_output", summary: "stdout output observed", stream: "stdout", truncated: false }),
      expect.objectContaining({ type: "job_finished", summary: "completed exit 0", status: "completed", exitCode: 0 })
    ]);
    expect(stateText).not.toContain(root);
    expect(stateText).not.toContain("private-title.txt");
    expect(stateText).not.toContain("private-stdout.txt");
    expect(stateText).not.toContain("private-output.txt");
    expect(stateText).not.toContain("private-launch.txt");
    expect(stateText).not.toContain("\"cwd\"");
    expect(stateText).not.toContain("\"stdout\":");
    expect(stateText).not.toContain("\"stderr\":");
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

  it("hydrates orchestrator state from persisted daemon events", async () => {
    const root = mkdtempSync(join(tmpdir(), "cognopticon-orchestrator-state-"));
    const stateDir = join(root, ".cognopticon", "state");
    mkdirSync(stateDir, { recursive: true });
    writeDemoFixtures(root);
    writeFileSync(join(stateDir, "events.jsonl"), [
      JSON.stringify({
        id: "daemon:session",
        type: "orchestrator_session_started",
        payload: {
          ok: true,
          sessionId: "orchestrator:restored",
          mode: "orchestrator",
          focusProjectId: "launchable-tool",
          visualizerUrl: "http://127.0.0.1:5173/#daemonToken=secret",
          startedAt: "2026-05-24T12:00:00.000Z",
          message: `restored from ${join(root, "private-session.txt")}`
        },
        createdAt: "2026-05-24T12:00:00.000Z"
      }),
      JSON.stringify({
        id: "daemon:completed",
        type: "orchestrator_task_completed",
        payload: {
          id: "task:completed",
          sessionId: "orchestrator:restored",
          taskId: "launchable-tool:inspect",
          projectId: "launchable-tool",
          label: `Inspect current state in ${join(root, "private-task.txt")}`,
          completed: true,
          source: "user_orchestrator",
          createdAt: "2026-05-24T12:00:01.000Z"
        },
        createdAt: "2026-05-24T12:00:01.000Z"
      }),
      JSON.stringify({
        id: "daemon:reopened",
        type: "orchestrator_task_reopened",
        payload: {
          id: "task:reopened",
          sessionId: "orchestrator:restored",
          taskId: "launchable-tool:scope",
          projectId: "launchable-tool",
          label: "Keep scope bounded",
          completed: false,
          source: "user_orchestrator",
          createdAt: "2026-05-24T12:00:02.000Z"
        },
        createdAt: "2026-05-24T12:00:02.000Z"
      })
    ].join("\n") + "\n");

    const daemon = createDaemon({
      root,
      configPath: false,
      config: {
        host: "127.0.0.1",
        port: 0,
        allowedRoots: [root],
        allowedOrigins: ["http://local.test"],
        daemon: { maxRequestBytes: 4096 },
        agents: { maxThreads: 1, maxRuntimeMs: 5000 }
      },
      spawn: createSpawnStub(),
      now: () => "2026-05-24T12:00:03.000Z",
      randomId: createDeterministicIds()
    });
    await new Promise((resolveListen) => daemon.server.listen(0, "127.0.0.1", resolveListen));
    daemons.push(daemon);
    const address = daemon.server.address();
    const url = `http://127.0.0.1:${address.port}`;

    const stateResponse = await fetch(`${url}/api/orchestrator/state`, { headers: { Origin: "http://local.test" } });
    const stateBody = await stateResponse.json();
    expect(stateResponse.status).toBe(200);
    expect(stateBody).toMatchObject({
      ok: true,
      active: true,
      latestSessionId: "orchestrator:restored",
      completedTaskIds: ["launchable-tool:inspect"],
      session: {
        sessionId: "orchestrator:restored",
        mode: "orchestrator",
        focusProjectId: "launchable-tool"
      }
    });
    expect(JSON.stringify(stateBody)).not.toContain("daemonToken");
    expect(JSON.stringify(stateBody)).not.toContain("visualizerUrl");
    expect(JSON.stringify(stateBody)).not.toContain(root);
    expect(JSON.stringify(stateBody)).not.toContain("private-session.txt");
    expect(JSON.stringify(stateBody)).not.toContain("private-task.txt");

    const recorded = await postJson(url, "/api/orchestrator/task-event", {
      taskId: "launchable-tool:verify",
      projectId: "launchable-tool",
      label: `Run verification in ${join(root, "private-live-task.txt")}`,
      completed: true
    });
    const recordedBody = await recorded.json();
    expect(recorded.status).toBe(200);
    expect(recordedBody.taskEvent).toMatchObject({
      sessionId: "orchestrator:restored",
      taskId: "launchable-tool:verify",
      completed: true
    });
    expect(JSON.stringify(recordedBody)).not.toContain(root);
    expect(JSON.stringify(recordedBody)).not.toContain("private-live-task.txt");

    const updatedState = await fetch(`${url}/api/orchestrator/state`, { headers: { Origin: "http://local.test" } });
    const updatedBody = await updatedState.json();
    expect(JSON.stringify(updatedBody)).not.toContain(root);
    expect(JSON.stringify(updatedBody)).not.toContain("private-live-task.txt");
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
        id: "daemon:raw-output",
        type: "job_output",
        payload: { jobId: "job:1", stream: "stdout", text: "opened /home/user/private/project/secret.txt", truncated: false },
        createdAt: "2026-05-22T12:00:01.600Z"
      }),
      JSON.stringify({
        id: "daemon:raw-job",
        type: "job_finished",
        payload: { id: "job:1", cwd: "/home/user/private/project", command: "node", args: ["/home/user/private/project/proof.mjs"], status: "completed", ok: true, stdout: "/home/user/private/project/secret.txt", stderr: "" },
        createdAt: "2026-05-22T12:00:01.700Z"
      }),
      JSON.stringify({
        id: "daemon:raw-open",
        type: "file_opened",
        payload: { path: "/home/user/private/project/secret.txt" },
        createdAt: "2026-05-22T12:00:01.800Z"
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
    const snapshotText = snapshot.join("\n");

    expect(snapshot).toHaveLength(6);
    expect(snapshotText).not.toContain("Origin is not allowed");
    expect(snapshotText).not.toContain("/home/user/private/project");
    expect(snapshotText).not.toContain("secret.txt");
    expect(snapshotText).not.toContain("\"cwd\"");
    expect(snapshotText).not.toContain("\"stdout\":");
    expect(snapshotText).not.toContain("\"stderr\":");
    expect(snapshotText).toContain("Path is outside configured Cognopticon roots.");
    expect(snapshotText).toContain("node eval/print commands are not supported");
    expect(snapshotText).toContain("job_output");
    expect(snapshotText).toContain("job_finished");
    expect(snapshotText).toContain("file_opened");
    expect(snapshotText).toContain("orchestrator_session_started");
  });

  it("serves event snapshots from a bounded tail window", async () => {
    const { url, root } = await startTestDaemon({
      config: { daemon: { maxEventSnapshotBytes: 4096 } }
    });
    const eventPath = join(root, ".cognopticon", "state", "events.jsonl");
    const events = Array.from({ length: 100 }, (_, index) => JSON.stringify({
      id: `daemon:old-${index}`,
      type: "orchestrator_session_started",
      payload: { sessionId: `orchestrator:${index}`, message: `old event ${index} ${"x".repeat(220)}` },
      createdAt: `2026-05-22T12:${String(index).padStart(2, "0")}:00.000Z`
    }));
    events.push(JSON.stringify({
      id: "daemon:newest",
      type: "orchestrator_session_started",
      payload: { sessionId: "orchestrator:newest", message: "tail-session-visible" },
      createdAt: "2026-05-22T13:00:00.000Z"
    }));
    writeFileSync(eventPath, `${events.join("\n")}\n`);

    const response = await fetch(`${url}/api/events`, { headers: { Origin: "http://local.test" } });
    const snapshot = await readSseSnapshot(response);
    const snapshotText = snapshot.join("\n");

    expect(snapshot.length).toBeLessThanOrEqual(50);
    expect(snapshotText).toContain("tail-session-visible");
    expect(snapshotText).not.toContain("old event 0");
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
        laptop: { id: "laptop", label: `Laptop ${root}`, allowedRoots: [root] },
        desktop: { id: "desktop", label: `Desktop ${join(root, "desktop-secret")}`, allowedRoots: [root] }
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
    const serialized = JSON.stringify(body);

    expect(body.activeProfile).toMatchObject({ id: "laptop", label: "Laptop [redacted path]", active: true, allowedRootCount: 1 });
    expect(body.profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "laptop", label: "Laptop [redacted path]", active: true, allowedRootCount: 1 }),
      expect.objectContaining({ id: "desktop", label: "Desktop [redacted path]", active: false, allowedRootCount: 1 })
    ]));
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain("desktop-secret");
    expect(serialized).not.toContain("stateDir");
    expect(serialized).not.toContain("allowedRoots");
    expect(serialized).not.toContain(".cognopticon");
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
      const context = { command, args, options };
      const stdoutText = typeof stdout === "function" ? stdout(context) : stdout;
      const stderrText = typeof stderr === "function" ? stderr(context) : stderr;
      if (stdoutText) child.stdout.write(stdoutText);
      if (stderrText) child.stderr.write(stderrText);
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

async function pollJob(baseUrl, jobId) {
  const deadline = Date.now() + 2000;
  let lastBody;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`, {
      headers: { Origin: "http://local.test" }
    });
    lastBody = await response.json();
    if (lastBody.job && ["completed", "failed", "cancelled", "timed_out"].includes(lastBody.job.status)) return lastBody.job;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`Timed out waiting for job ${jobId}: ${JSON.stringify(lastBody)}`);
}

async function readSseUntil(response, predicate, timeoutMs = 2000) {
  expect(response.status).toBe(200);
  expect(response.body).not.toBeNull();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const { value, done } = await readSseChunk(reader, Math.max(1, deadline - Date.now()));
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (predicate(text)) return text;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  throw new Error(`Timed out waiting for SSE event. Received:\n${text}`);
}

function readSseChunk(reader, timeoutMs) {
  return Promise.race([
    reader.read(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("SSE read timed out")), timeoutMs))
  ]);
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
