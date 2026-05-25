import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetDaemonTokenForTests, __setDaemonEventReconnectDelayForTests, checkDaemonHealth, createDaemonJob, daemonToken, getDaemonJob, getDaemonRunState, getOrchestratorState, isDaemonRequestBoundaryFailure, normalizeDaemonEvent, openDaemonPath, recordOrchestratorTaskEvent, runDaemonCommand, sanitizeDaemonErrorMessage, startOrchestratorSession, subscribeDaemonEvents } from "./daemonClient";

afterEach(() => {
  __resetDaemonTokenForTests();
  vi.unstubAllGlobals();
});

describe("daemon event normalization", () => {
  it("drops request-boundary failures from the operator runtime stream", () => {
    expect(isDaemonRequestBoundaryFailure({ error: "Origin is not allowed: http://127.0.0.1:5176" })).toBe(true);
    expect(isDaemonRequestBoundaryFailure({ error: "Cognopticon daemon token is required for this origin" })).toBe(true);
    expect(isDaemonRequestBoundaryFailure({ error: "Cognopticon daemon token must be sent in X-Cognopticon-Token header" })).toBe(true);

    const event = normalizeDaemonEvent({
      id: "daemon:boundary",
      type: "action_failed",
      payload: { error: "Origin is not allowed: http://127.0.0.1:5176" },
      createdAt: "2026-05-23T12:00:00.000Z"
    });

    expect(event).toBeNull();
  });

  it("keeps actionable daemon failures with structured provenance", () => {
    const event = normalizeDaemonEvent({
      id: "daemon:policy",
      type: "action_failed",
      payload: {
        error: "Destructive commands are not supported",
        category: "policy_block",
        action: "daemon_job",
        endpoint: "/api/jobs",
        method: "POST",
        requestId: "request:1"
      },
      createdAt: "2026-05-23T12:00:00.000Z"
    });

    expect(event).toMatchObject({
      id: "daemon:policy",
      type: "action_failed",
      workspaceId: "local",
      payload: {
        category: "policy_block",
        action: "daemon_job",
        requestId: "request:1"
      }
    });
  });

  it("redacts path-bearing daemon failures before they enter app state", () => {
    const event = normalizeDaemonEvent({
      id: "daemon:path",
      type: "action_failed",
      payload: {
        error: "Path is outside configured Cognopticon roots: /home/user/private/project",
        category: "policy_block",
        action: "daemon_job",
        endpoint: "/api/jobs",
        method: "POST",
        requestId: "request:path"
      },
      createdAt: "2026-05-23T12:00:00.000Z"
    });

    expect(event?.payload).toMatchObject({ error: "Path is outside configured Cognopticon roots." });
    expect(JSON.stringify(event)).not.toContain("/home/user/private/project");
  });

  it("redacts generic filesystem-looking substrings as a fallback", () => {
    expect(sanitizeDaemonErrorMessage("failed at /home/user/private/file.txt")).toBe("failed at [redacted path]");
    expect(sanitizeDaemonErrorMessage("failed at C:\\Users\\User\\secret.txt")).toBe("failed at [redacted path]");
  });

  it("sanitizes direct daemon action responses before app state", async () => {
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:5173/"),
      sessionStorage: memoryStorage({ "cognopticon:daemonToken": "action-secret" }),
      localStorage: memoryStorage(),
      history: { state: {}, replaceState: vi.fn() }
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/actions/open-path")) {
        return new Response(JSON.stringify({
          ok: true,
          actionId: "open-path",
          eventId: "daemon:open",
          message: "Opened /home/user/private/project/secret.txt"
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        ok: true,
        actionId: "run-command",
        eventId: "daemon:run",
        message: "ran npm in /home/user/private/project",
        stdout: "ok /home/user/private/project/stdout.txt",
        stderr: "warn C:\\Users\\User\\secret.txt"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const opened = await openDaemonPath({ path: "/home/user/private/project/secret.txt" }, "http://127.0.0.1:8787");
    const command = await runDaemonCommand({ cwd: "/home/user/private/project", command: "npm", args: ["test"] }, "http://127.0.0.1:8787");

    expect(opened).toMatchObject({
      ok: true,
      actionId: "open-path",
      eventId: "daemon:open",
      message: "Opened [redacted path]"
    });
    expect(command).toMatchObject({
      ok: true,
      actionId: "run-command",
      eventId: "daemon:run",
      message: "ran npm in [redacted path]",
      stdout: "ok [redacted path]",
      stderr: "warn [redacted path]"
    });
    expect(JSON.stringify({ opened, command })).not.toContain("/home/user");
    expect(JSON.stringify({ opened, command })).not.toContain("C:\\Users");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8787/api/actions/open-path", expect.objectContaining({
      headers: expect.objectContaining({ "X-Cognopticon-Token": "action-secret" })
    }));
  });

  it("redacts raw local paths in job events before they enter app state", () => {
    const outputEvent = normalizeDaemonEvent({
      id: "daemon:output",
      type: "job_output",
      payload: { jobId: "job:1", stream: "stdout", text: "daemon-proof-ok /home/user/private/proof.txt", truncated: false },
      createdAt: "2026-05-23T12:00:00.000Z"
    });
    const finishedEvent = normalizeDaemonEvent({
      id: "daemon:finished",
      type: "job_finished",
      payload: { id: "job:1", command: "node", args: ["/home/user/private/proof.mjs"], status: "completed", ok: true },
      createdAt: "2026-05-23T12:00:01.000Z"
    });

    expect(outputEvent).toMatchObject({
      id: "daemon:output",
      type: "job_output",
      payload: { jobId: "job:1", text: "daemon-proof-ok [redacted path]" }
    });
    expect(JSON.stringify(outputEvent)).not.toContain("/home/user");
    expect(finishedEvent).toMatchObject({
      id: "daemon:finished",
      type: "job_finished",
      payload: { id: "job:1", command: "node", args: ["[redacted path]"], status: "completed" }
    });
    expect(JSON.stringify(finishedEvent)).not.toContain("/home/user");
  });

  it("bootstraps daemon tokens into session storage and strips visible URLs", async () => {
    const sessionStorage = memoryStorage();
    const localStorage = memoryStorage({ "cognopticon:daemonToken": "legacy-secret" });
    const history = { state: {}, replaceState: vi.fn() };
    vi.stubGlobal("document", { title: "Cognopticon" });
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:5173/?daemonToken=query-secret&view=graph#daemonToken=fragment-secret&mode=dev"),
      sessionStorage,
      localStorage,
      history
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, daemon: "cognopticon" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await checkDaemonHealth("http://127.0.0.1:8787");

    expect(daemonToken()).toBe("fragment-secret");
    expect(sessionStorage.getItem("cognopticon:daemonToken")).toBe("fragment-secret");
    expect(localStorage.getItem("cognopticon:daemonToken")).toBeNull();
    expect(history.replaceState).toHaveBeenCalled();
    expect(String(history.replaceState.mock.calls[0][2])).not.toContain("daemonToken");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8787/api/health", expect.objectContaining({
      headers: { "X-Cognopticon-Token": "fragment-secret" }
    }));
  });

  it("does not accept app URL query-string daemon tokens", async () => {
    const sessionStorage = memoryStorage();
    const history = { state: {}, replaceState: vi.fn() };
    vi.stubGlobal("document", { title: "Cognopticon" });
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:5173/?daemonToken=query-secret&view=graph"),
      sessionStorage,
      localStorage: memoryStorage(),
      history
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, daemon: "cognopticon" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await checkDaemonHealth("http://127.0.0.1:8787");

    expect(daemonToken()).toBeUndefined();
    expect(sessionStorage.getItem("cognopticon:daemonToken")).toBeNull();
    expect(history.replaceState).toHaveBeenCalled();
    expect(String(history.replaceState.mock.calls[0][2])).not.toContain("daemonToken");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8787/api/health", expect.objectContaining({
      headers: {}
    }));
  });

  it("uses the daemon-served app origin before falling back to the default daemon port", async () => {
    const sessionStorage = memoryStorage();
    vi.stubGlobal("document", { title: "Cognopticon" });
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:45678/#daemonToken=origin-secret"),
      sessionStorage,
      localStorage: memoryStorage(),
      history: { state: {}, replaceState: vi.fn() }
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "http://127.0.0.1:45678/api/health") {
        return new Response(JSON.stringify({ ok: true, daemon: "cognopticon" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await checkDaemonHealth();

    expect(status).toMatchObject({ online: true, url: "http://127.0.0.1:45678" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:45678/api/health", expect.objectContaining({
      headers: { "X-Cognopticon-Token": "origin-secret" }
    }));
  });

  it("keeps daemon health metadata sanitized before UI state", async () => {
    vi.stubGlobal("document", { title: "Cognopticon" });
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:5173/"),
      sessionStorage: memoryStorage(),
      localStorage: memoryStorage(),
      history: { state: {}, replaceState: vi.fn() }
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      daemon: "cognopticon",
      runtimeMode: "local_daemon",
      profile: {
        id: "laptop",
        label: "Laptop /home/user/private",
        deviceId: "rig-01",
        stateDir: "/home/user/.cognopticon/state"
      },
      allowedRoots: ["/home/user/private"],
      allowedRootCount: 1,
      jobs: { queued: 1, running: 2, completed: 3, failed: 4, cancelled: 5, timed_out: 6 },
      orchestrator: { sessions: 1, taskEvents: 2, latestSessionId: "session:1" }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const status = await checkDaemonHealth("http://127.0.0.1:8787");

    expect(status).toMatchObject({
      online: true,
      runtimeMode: "local_daemon",
      profile: { id: "laptop", label: "Laptop [redacted path]", deviceId: "rig-01" },
      allowedRootCount: 1,
      jobs: { queued: 1, running: 2, completed: 3, failed: 4, cancelled: 5, timed_out: 6 },
      orchestrator: { sessions: 1, taskEvents: 2, latestSessionId: "session:1" }
    });
    expect(JSON.stringify(status)).not.toContain("/home/user");
    expect(JSON.stringify(status)).not.toContain("allowedRoots");
    expect(JSON.stringify(status)).not.toContain("stateDir");
  });

  it("does not treat a dev-server HTML fallback as daemon health", async () => {
    vi.stubGlobal("document", { title: "Cognopticon" });
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:5173/"),
      sessionStorage: memoryStorage(),
      localStorage: memoryStorage(),
      history: { state: {}, replaceState: vi.fn() }
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "http://127.0.0.1:5173/api/health") {
        return new Response("<!doctype html><title>Cognopticon</title>", { status: 200, headers: { "Content-Type": "text/html" } });
      }
      return new Response(JSON.stringify({ ok: true, daemon: "cognopticon" }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await checkDaemonHealth();

    expect(status).toMatchObject({ online: true, url: "http://127.0.0.1:8787" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes a cached daemon token from a new hash token in the same tab", () => {
    const sessionStorage = memoryStorage({ "cognopticon:daemonToken": "old-secret" });
    const history = { state: {}, replaceState: vi.fn() };
    vi.stubGlobal("document", { title: "Cognopticon" });
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:5173/#daemonToken=new-secret"),
      sessionStorage,
      localStorage: memoryStorage(),
      history
    });

    expect(daemonToken()).toBe("new-secret");
    expect(sessionStorage.getItem("cognopticon:daemonToken")).toBe("new-secret");
    expect(history.replaceState).toHaveBeenCalled();
    expect(String(history.replaceState.mock.calls[0][2])).not.toContain("daemonToken");
  });

  it("loads bounded orchestrator state with daemon auth headers", async () => {
    const sessionStorage = memoryStorage({ "cognopticon:daemonToken": "state-secret" });
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:5173/"),
      sessionStorage,
      localStorage: memoryStorage(),
      history: { state: {}, replaceState: vi.fn() }
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      active: true,
      latestSessionId: "orchestrator:1",
      session: {
        sessionId: "orchestrator:1",
        mode: "orchestrator",
        focusProjectId: "launchable-tool",
        startedAt: "2026-05-24T12:00:00.000Z",
        message: "restored"
      },
      taskEvents: [{
        id: "task:1",
        sessionId: "orchestrator:1",
        taskId: "launchable-tool:inspect",
        projectId: "launchable-tool",
        label: "Inspect current state",
        completed: true,
        createdAt: "2026-05-24T12:00:01.000Z"
      }],
      completedTaskIds: ["launchable-tool:inspect"]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const state = await getOrchestratorState("http://127.0.0.1:8787");

    expect(state).toMatchObject({
      ok: true,
      active: true,
      latestSessionId: "orchestrator:1",
      completedTaskIds: ["launchable-tool:inspect"]
    });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8787/api/orchestrator/state", expect.objectContaining({
      headers: { "X-Cognopticon-Token": "state-secret" }
    }));
  });

  it("preserves sanitized daemon rejection bodies for orchestrator session flows", async () => {
    const sessionStorage = memoryStorage({ "cognopticon:daemonToken": "orchestrator-secret" });
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:5173/"),
      sessionStorage,
      localStorage: memoryStorage(),
      history: { state: {}, replaceState: vi.fn() }
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/orchestrator/session")) {
        return new Response(JSON.stringify({ error: "Path is outside configured Cognopticon roots: /home/user/private/project" }), {
          status: 403,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ error: "Unknown orchestrator session: orchestrator:stale" }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const session = await startOrchestratorSession({ focusProjectId: "launchable-tool", visualizerUrl: "http://127.0.0.1:5173/" }, "http://127.0.0.1:8787");
    const taskEvent = await recordOrchestratorTaskEvent({
      sessionId: "orchestrator:stale",
      taskId: "launchable-tool:inspect",
      projectId: "launchable-tool",
      label: "Inspect current state",
      completed: true
    }, "http://127.0.0.1:8787");

    expect(session).toMatchObject({
      ok: false,
      message: "Path is outside configured Cognopticon roots."
    });
    expect(taskEvent).toMatchObject({
      ok: false,
      message: "Unknown orchestrator session: orchestrator:stale"
    });
    expect(JSON.stringify(session)).not.toContain("/home/user");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8787/api/orchestrator/session", expect.objectContaining({
      headers: expect.objectContaining({ "X-Cognopticon-Token": "orchestrator-secret" })
    }));
  });

  it("loads daemon-backed run state with auth headers", async () => {
    const sessionStorage = memoryStorage({ "cognopticon:daemonToken": "runs-secret" });
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:5173/"),
      sessionStorage,
      localStorage: memoryStorage(),
      history: { state: {}, replaceState: vi.fn() }
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      runs: [{
        id: "verify:launchable-tool",
        projectId: "launchable-tool",
        title: "Launchable Tool verification",
        status: "completed",
        summary: "npm run test exited 0 in /home/user/private/project",
        command: "npm run test -- /home/user/private/project",
        jobId: "job:1",
        createdAt: "2026-05-24T12:00:00.000Z",
        updatedAt: "2026-05-24T12:00:03.000Z"
      }],
      jobs: [{
        id: "job:1",
        runId: "verify:launchable-tool",
        projectId: "launchable-tool",
        title: "Launchable Tool verification at C:\\Users\\User\\secret",
        command: "npm",
        args: ["run", "test", "/home/user/private/project"],
        status: "completed",
        ok: true,
        exitCode: 0,
        createdAt: "2026-05-24T12:00:00.000Z",
        updatedAt: "2026-05-24T12:00:03.000Z",
        timeoutMs: 5000,
        events: [
          { id: "daemon:queued", type: "job_queued", createdAt: "2026-05-24T12:00:00.000Z", summary: "Queued npm run test in /home/user/private/project" },
          { id: "daemon:output", type: "job_output", createdAt: "2026-05-24T12:00:02.000Z", summary: "stdout output observed C:\\Users\\User\\secret.txt", stream: "stdout", truncated: false },
          { id: "daemon:finished", type: "job_finished", createdAt: "2026-05-24T12:00:03.000Z", summary: "completed exit 0", status: "completed", exitCode: 0 }
        ]
      }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const state = await getDaemonRunState("http://127.0.0.1:8787");

    expect(state).toMatchObject({
      ok: true,
      runs: [{ id: "verify:launchable-tool", status: "completed" }],
      jobs: [{
        id: "job:1",
        status: "completed",
        events: [{ type: "job_queued" }, { type: "job_output" }, { type: "job_finished" }]
      }]
    });
    expect(JSON.stringify(state)).not.toContain("/home/user");
    expect(JSON.stringify(state)).not.toContain("C:\\Users");
    expect(state.runs[0].summary).toBe("npm run test exited 0 in [redacted path]");
    expect(state.runs[0].command).toBe("npm run test -- [redacted path]");
    expect(state.jobs[0].title).toBe("Launchable Tool verification at [redacted path]");
    expect(state.jobs[0].args).toEqual(["run", "test", "[redacted path]"]);
    expect(state.jobs[0].events?.[0].summary).toBe("Queued npm run test in [redacted path]");
    expect(state.jobs[0].events?.[1].summary).toBe("stdout output observed [redacted path]");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8787/api/runs/state", expect.objectContaining({
      headers: { "X-Cognopticon-Token": "runs-secret" }
    }));
  });

  it("sanitizes daemon job rejection messages before app state", async () => {
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:5173/"),
      sessionStorage: memoryStorage(),
      localStorage: memoryStorage(),
      history: { state: {}, replaceState: vi.fn() }
    });
    const fetchMock = vi.fn(async (url: string) => {
      const error = url.endsWith("/api/jobs")
        ? "Path is outside configured Cognopticon roots: /home/user/private/project"
        : "Lookup failed for C:\\Users\\User\\secret.txt";
      return new Response(JSON.stringify({ error }), { status: 403, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const queued = await createDaemonJob({ cwd: "/home/user/private/project", command: "npm", args: ["test"] }, "http://127.0.0.1:8787");
    const loaded = await getDaemonJob("job:secret", "http://127.0.0.1:8787");

    expect(queued).toMatchObject({ ok: false, message: "Path is outside configured Cognopticon roots." });
    expect(loaded).toMatchObject({ ok: false, message: "Lookup failed for [redacted path]" });
    expect(JSON.stringify({ queued, loaded })).not.toContain("/home/user");
    expect(JSON.stringify({ queued, loaded })).not.toContain("C:\\Users");
  });

  it("sanitizes direct daemon job responses before app state", async () => {
    const sessionStorage = memoryStorage({ "cognopticon:daemonToken": "job-secret" });
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:5173/"),
      sessionStorage,
      localStorage: memoryStorage(),
      history: { state: {}, replaceState: vi.fn() }
    });
    const jobBody = {
      id: "job:1",
      runId: "verify:launchable-tool",
      projectId: "launchable-tool",
      title: "Launchable Tool verification",
      cwd: "/home/user/private/project",
      command: "npm",
      args: ["run", "test"],
      status: "completed",
      ok: true,
      exitCode: 0,
      stdout: "ok /home/user/private/project/secret.txt",
      stderr: "warn C:\\Users\\User\\secret.txt",
      createdAt: "2026-05-24T12:00:00.000Z",
      updatedAt: "2026-05-24T12:00:03.000Z",
      timeoutMs: 5000,
      eventId: "daemon:finished"
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/jobs")) {
        return new Response(JSON.stringify({ ok: true, jobId: "job:1", job: jobBody }), { status: 202, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true, job: jobBody }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const queued = await createDaemonJob({ cwd: "/home/user/private/project", command: "npm", args: ["run", "test"] }, "http://127.0.0.1:8787");
    const loaded = await getDaemonJob("job:1", "http://127.0.0.1:8787");

    expect(queued.job).toMatchObject({ id: "job:1", command: "npm", status: "completed" });
    expect(loaded.job).toMatchObject({ id: "job:1", command: "npm", status: "completed" });
    expect(JSON.stringify(queued)).not.toContain("/home/user");
    expect(JSON.stringify(loaded)).not.toContain("/home/user");
    expect(JSON.stringify(loaded)).not.toContain("C:\\Users");
    expect(JSON.stringify(loaded)).not.toContain("stdout");
    expect(JSON.stringify(loaded)).not.toContain("stderr");
    expect(JSON.stringify(loaded)).not.toContain("cwd");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8787/api/jobs/job%3A1", expect.objectContaining({
      headers: { "X-Cognopticon-Token": "job-secret" }
    }));
  });

  it("rejects malformed daemon run state without leaking into app state", async () => {
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:5173/"),
      sessionStorage: memoryStorage(),
      localStorage: memoryStorage(),
      history: { state: {}, replaceState: vi.fn() }
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      runs: [{
        id: "bad-run",
        projectId: "launchable-tool",
        title: "Bad run",
        status: "completed",
        summary: "bad",
        createdAt: "2026-05-24T12:00:00.000Z",
        updatedAt: "2026-05-24T12:00:03.000Z"
      }],
      jobs: [{
        id: "job:bad",
        command: "npm",
        args: ["run", "test"],
        status: "completed",
        ok: true,
        createdAt: "2026-05-24T12:00:00.000Z",
        updatedAt: "2026-05-24T12:00:03.000Z",
        events: [{ id: "daemon:bad", type: "job_output" }]
      }]
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const state = await getDaemonRunState("http://127.0.0.1:8787");

    expect(state).toMatchObject({
      ok: false,
      runs: [],
      jobs: [],
      message: "Daemon returned malformed run state."
    });
  });

  it("streams daemon events with fetch headers and reconnects after EOF", async () => {
    __setDaemonEventReconnectDelayForTests(5);
    const sessionStorage = memoryStorage({ "cognopticon:daemonToken": "stream-secret" });
    vi.stubGlobal("window", {
      location: new URL("http://127.0.0.1:5173/"),
      sessionStorage,
      localStorage: memoryStorage(),
      history: { state: {}, replaceState: vi.fn() }
    });
    const fetchMock = vi.fn(async () => {
      const attempt = fetchMock.mock.calls.length;
      const eventLine = JSON.stringify({
        id: `daemon:policy:${attempt}`,
        type: "action_failed",
        payload: { error: "Destructive commands are not supported", category: "policy_block", action: "daemon_job" },
        createdAt: "2026-05-24T01:00:00.000Z"
      });
      return new Response(`event: snapshot\ndata: ${JSON.stringify([eventLine])}\n\n`, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const events: unknown[] = [];

    const unsubscribe = subscribeDaemonEvents((event) => events.push(event), "http://127.0.0.1:8787");
    await vi.waitFor(() => expect(events.length).toBeGreaterThanOrEqual(2));
    unsubscribe();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8787/api/events", expect.objectContaining({
      headers: { "X-Cognopticon-Token": "stream-secret" }
    }));
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const firstCall = fetchMock.mock.calls[0] as unknown[];
    expect(String(firstCall[0])).not.toContain("daemonToken");
  });
});

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    }
  } as Storage;
}
