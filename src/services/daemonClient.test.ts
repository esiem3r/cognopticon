import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetDaemonTokenForTests, __setDaemonEventReconnectDelayForTests, checkDaemonHealth, daemonToken, getOrchestratorState, isDaemonRequestBoundaryFailure, normalizeDaemonEvent, sanitizeDaemonErrorMessage, subscribeDaemonEvents } from "./daemonClient";

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

  it("normalizes redacted job events without depending on raw local paths", () => {
    const outputEvent = normalizeDaemonEvent({
      id: "daemon:output",
      type: "job_output",
      payload: { jobId: "job:1", stream: "stdout", text: "daemon-proof-ok [redacted path]", truncated: false },
      createdAt: "2026-05-23T12:00:00.000Z"
    });
    const finishedEvent = normalizeDaemonEvent({
      id: "daemon:finished",
      type: "job_finished",
      payload: { id: "job:1", command: "node", args: ["proof.mjs"], status: "completed", ok: true },
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
      payload: { id: "job:1", command: "node", status: "completed" }
    });
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
