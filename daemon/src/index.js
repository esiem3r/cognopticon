import { createServer } from "node:http";
import { stat } from "node:fs/promises";
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { assertAllowlistedCommand, normalizeArgs, resolveInsideAllowedRoots } from "./security.js";
import { loadRuntimeConfig, normalizeProfile } from "../../scripts/runtime-config.mjs";

const sourceFile = fileURLToPath(import.meta.url);
export const defaultRoot = resolve(dirname(sourceFile), "../..");

export function buildDefaultConfig(root = defaultRoot) {
  return {
    host: "127.0.0.1",
    port: 8787,
    allowedRoots: [root],
    allowedCommands: ["npm", "node"],
    editorCommand: "code",
    allowedOrigins: ["http://127.0.0.1:8787", "http://localhost:8787"],
    agents: { maxThreads: 8, maxRuntimeMs: 900000 }
  };
}

export function loadDaemonConfig(root = defaultRoot, configPath = join(root, ".cognopticon", "config.json")) {
  const baseConfig = buildDefaultConfig(root);
  if (!existsSync(configPath)) return baseConfig;
  return mergeConfig(baseConfig, JSON.parse(readFileSync(configPath, "utf8")));
}

export function createDaemon(options = {}) {
  const root = resolve(options.root ?? defaultRoot);
  const configPath = options.configPath === false ? undefined : resolve(root, options.configPath ?? ".cognopticon/config.json");
  const fileConfig = configPath && existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, "utf8"))
    : {};
  const runtimeConfig = options.runtimeConfig ?? loadRuntimeConfig(root, {
    configPath: options.configPath,
    requireInitialized: options.requireInitialized ?? options.configPath !== false
  });
  const profileRuntime = Boolean(options.runtimeConfig || runtimeConfig.initialized || fileConfig.activeProfile || fileConfig.profiles || fileConfig.profile);
  const profileConfig = profileRuntime ? {
    profile: publicProfile(runtimeConfig.profile),
    allowedRoots: runtimeConfig.profile.allowedRoots
  } : {};
  const config = normalizeConfig(root, mergeConfig(mergeConfig(mergeConfig(buildDefaultConfig(root), fileConfig), profileConfig), options.config ?? {}));
  const stateDir = options.stateDir ?? (profileRuntime ? runtimeConfig.profile.paths.stateDir : join(root, ".cognopticon", "state"));
  const eventPath = options.eventPath ?? join(stateDir, "events.jsonl");
  mkdirSync(stateDir, { recursive: true });

  const jobs = new Map();
  const queue = [];
  const jobLedger = new Map();
  const eventClients = new Set();
  const orchestratorSessions = new Map();
  const taskEvents = [];
  const maxJobLedgerRecords = Number(config.daemon?.maxJobLedgerRecords ?? 200);
  const maxPublicRunRecords = Number(config.daemon?.maxPublicRunRecords ?? 50);
  const maxOutputBytes = Number(config.daemon?.maxOutputBytes ?? 256000);
  const maxEventOutputBytes = clamp(Number(config.daemon?.maxEventOutputBytes ?? Math.min(maxOutputBytes, 8192)), 0, Math.max(0, maxOutputBytes));
  const maxEventSnapshotBytes = clamp(Number(config.daemon?.maxEventSnapshotBytes ?? 262144), 4096, 1048576);
  const maxRequestBytes = Number(config.daemon?.maxRequestBytes ?? 65536);
  const maxRuntimeMs = Number(config.agents?.maxRuntimeMs ?? 900000);
  const spawnProcess = options.spawn ?? spawn;
  const now = options.now ?? (() => new Date().toISOString());
  const randomId = options.randomId ?? (() => randomUUID());
  hydrateDaemonState();

  const server = createServer(async (request, response) => {
    try {
      response.cognopticonOrigin = responseOriginFor(request);
      if (request.method === "OPTIONS") return sendOptions(response);
      assertAllowedRequestOrigin(request);
      if (!request.url) return send(response, 404, { error: "missing url" });
      const url = new URL(request.url, `http://${config.host}:${config.port}`);
      if (url.searchParams.has("daemonToken")) throw new Error("Cognopticon daemon token must be sent in X-Cognopticon-Token header");
      if (url.pathname === "/api/health") return send(response, 200, healthSnapshot());
      if (url.pathname === "/api/profiles") return send(response, 200, sanitizeObjectStrings({
        ok: true,
        activeProfile: publicProfile(config.profile, { active: true, allowedRootCount: config.allowedRoots.length }),
        profiles: publicProfiles(runtimeConfig, root)
      }));
      if (url.pathname === "/api/workspace") return await sendWorkspace(response);
      if (url.pathname === "/api/events") return await sendEvents(response);
      if (request.method === "GET" && url.pathname === "/api/orchestrator/state") return send(response, 200, orchestratorState());
      if (request.method === "GET" && url.pathname === "/api/runs/state") return send(response, 200, daemonRunState());
      if (request.method === "POST" && url.pathname === "/api/orchestrator/session") return await startOrchestratorSession(request, response);
      if (request.method === "POST" && url.pathname === "/api/orchestrator/task-event") return await recordTaskEvent(request, response);
      if (request.method === "POST" && url.pathname === "/api/actions/open-path") return await openPath(request, response);
      if (request.method === "POST" && url.pathname === "/api/actions/open-editor") return await openEditor(request, response);
      if (request.method === "POST" && url.pathname === "/api/actions/run-command") return await createJob(request, response, true);
      if (request.method === "POST" && url.pathname === "/api/jobs") return await createJob(request, response, false);
      const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)(?:\/cancel)?$/);
      if (jobMatch && request.method === "GET") return sendJob(response, decodeURIComponent(jobMatch[1]));
      if (jobMatch && request.method === "POST" && url.pathname.endsWith("/cancel")) return cancelJob(response, decodeURIComponent(jobMatch[1]));
      return serveStatic(url.pathname, response);
    } catch (error) {
      const requestBoundaryError = isRequestBoundaryError(error);
      const responseError = error instanceof Error ? error.message : "Unknown daemon error";
      if (!requestBoundaryError) logEvent("action_failed", failurePayloadFor(request, error));
      return send(response, 500, { error: requestBoundaryError ? responseError : safeFailureMessage(responseError) });
    }
  });

  async function sendWorkspace(response) {
    const profileState = runtimeConfig.profile?.paths?.workspace;
    const target = profileRuntime && profileState && existsSync(profileState) ? profileState : undefined;
    send(response, 200, target ? readJsonFile(target) : loadDemoWorkspace(root));
  }

  async function sendEvents(response) {
    response.writeHead(200, sseHeaders.call(response));
    response.flushHeaders?.();
    const snapshot = eventSnapshotLines(eventPath, sanitizeEventLine, maxEventSnapshotBytes);
    if (snapshot.length) response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
    eventClients.add(response);
    requestClose(response, () => eventClients.delete(response));
  }

  async function openPath(request, response) {
    const body = await readJson(request);
    const path = resolveInsideAllowedRoots(String(body.path ?? ""), config.allowedRoots);
    const opener = openPathSpawnSpec(path);
    const result = spawnProcess(opener.command, opener.args, { shell: false, detached: true, stdio: "ignore" });
    result.unref();
    const payload = { ok: true, actionId: "open-path", eventId: logEvent("file_opened", { path }), message: "Opened allowed local path." };
    send(response, 200, payload);
  }

  async function openEditor(request, response) {
    const body = await readJson(request);
    const path = resolveInsideAllowedRoots(String(body.path ?? ""), config.allowedRoots);
    assertAllowlistedCommand(config.editorCommand, [...config.allowedCommands, "code", "notepad.exe"]);
    const result = spawnProcess(config.editorCommand, [path], { shell: false, detached: true, stdio: "ignore" });
    result.unref();
    send(response, 200, { ok: true, actionId: "open-editor", eventId: logEvent("file_opened", { path, editor: config.editorCommand }), message: "Opened configured editor for allowed local path." });
  }

  async function startOrchestratorSession(request, response) {
    const body = await readJson(request);
    const focusProjectId = typeof body.focusProjectId === "string" ? body.focusProjectId : undefined;
    const visualizerUrl = typeof body.visualizerUrl === "string" ? body.visualizerUrl : `http://${config.host}:${config.visualizerPort ?? 5173}/`;
    const sessionId = makeId("orchestrator");
    const payload = {
      ok: true,
      sessionId,
      mode: "orchestrator",
      focusProjectId,
      visualizerUrl,
      startedAt: now(),
      message: "User-facing orchestrator session armed. Worker agents remain behind the orchestrator boundary."
    };
    orchestratorSessions.set(sessionId, payload);
    const eventId = logEvent("orchestrator_session_started", payload);
    send(response, 200, { ...payload, eventId });
  }

  async function recordTaskEvent(request, response) {
    const body = await readJson(request);
    const taskId = requireString(body.taskId, "taskId");
    const projectId = requireString(body.projectId, "projectId");
    const label = requireString(body.label, "label");
    const completed = Boolean(body.completed);
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : latestSessionId();
    if (sessionId && !orchestratorSessions.has(sessionId)) throw new Error(`Unknown orchestrator session: ${sessionId}`);
    const taskEvent = {
      id: makeId("task"),
      sessionId,
      taskId,
      projectId,
      label,
      completed,
      source: "user_orchestrator",
      createdAt: now()
    };
    taskEvents.push(taskEvent);
    const eventId = logEvent(completed ? "orchestrator_task_completed" : "orchestrator_task_reopened", taskEvent);
    send(response, 200, {
      ok: true,
      eventId,
      taskEvent: publicOrchestratorTaskEvent(taskEvent),
      message: completed ? "Task completion recorded by daemon." : "Task reopening recorded by daemon."
    });
  }

  async function createJob(request, response, compatibilityMode) {
    const body = await readJson(request);
    const job = buildJob(body);
    jobs.set(job.id, job);
    queue.push(job.id);
    logEvent("job_queued", publicJob(job));
    pumpJobs();

    if (!compatibilityMode) return send(response, 202, { ok: true, jobId: job.id, job: publicJob(job) });

    waitForJob(job.id).then((finished) => {
      send(response, finished.ok ? 200 : 500, {
        ok: finished.ok,
        actionId: "run-command",
        jobId: finished.id,
        eventId: finished.eventId,
        message: `${finished.command} exited ${finished.exitCode}`,
        stdout: typeof job.stdout === "string" ? redactSensitiveText(job.stdout) : undefined,
        stderr: typeof job.stderr === "string" ? redactSensitiveText(job.stderr) : undefined
      });
    }).catch((error) => send(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }));
  }

  function buildJob(body) {
    const cwd = resolveInsideAllowedRoots(String(body.cwd ?? root), config.allowedRoots);
    const command = String(body.command ?? "");
    const args = normalizeArgs(body.args);
    assertSafeDaemonCommand(command, args, cwd, config);
    const timestamp = now();
    return {
      id: makeId("job"),
      runId: optionalString(body.runId, 180),
      projectId: optionalString(body.projectId, 180),
      title: optionalString(body.title, 240),
      cwd,
      command,
      args,
      status: "queued",
      stdout: "",
      stderr: "",
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutEventBytes: 0,
      stderrEventBytes: 0,
      stdoutEventTruncationLogged: false,
      stderrEventTruncationLogged: false,
      outputTruncated: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      timeoutMs: clamp(Number(body.timeoutMs ?? maxRuntimeMs), 1000, maxRuntimeMs)
    };
  }

  function pumpJobs() {
    const running = [...jobs.values()].filter((job) => job.status === "running").length;
    const available = Math.max(0, Number(config.agents?.maxThreads ?? 8) - running);
    for (let index = 0; index < available && queue.length; index += 1) {
      const jobId = queue.shift();
      const job = jobs.get(jobId);
      if (job && job.status === "queued") startJob(job);
    }
  }

  function startJob(job) {
    job.status = "running";
    job.startedAt = now();
    job.updatedAt = job.startedAt;
    logEvent("job_started", publicJob(job));
    const child = spawnProcess(job.command, job.args, { cwd: job.cwd, shell: false });
    job.child = child;
    job.timer = setTimeout(() => {
      job.timedOut = true;
      child.kill("SIGTERM");
      logEvent("job_timeout", publicJob(job));
    }, job.timeoutMs);
    child.stdout.on("data", (chunk) => appendOutput(job, "stdout", chunk));
    child.stderr.on("data", (chunk) => appendOutput(job, "stderr", chunk));
    child.on("close", (code, signal) => finishJob(job, code, signal));
    child.on("error", (error) => {
      job.error = error.message;
      finishJob(job, 1, null);
    });
  }

  function appendOutput(job, stream, chunk) {
    const text = chunk.toString();
    const byteKey = `${stream}Bytes`;
    const remaining = Math.max(0, maxOutputBytes - job[byteKey]);
    if (remaining > 0) {
      const kept = Buffer.from(text).subarray(0, remaining).toString();
      job[stream] += kept;
      job[byteKey] += Buffer.byteLength(kept);
    }
    if (Buffer.byteLength(text) > remaining) job.outputTruncated = true;

    const eventByteKey = `${stream}EventBytes`;
    const eventFlagKey = `${stream}EventTruncationLogged`;
    const eventRemaining = Math.max(0, maxEventOutputBytes - job[eventByteKey]);
    const eventText = eventRemaining > 0 ? truncateUtf8Text(text, eventRemaining) : "";
    if (eventText) job[eventByteKey] += Buffer.byteLength(eventText);
    const eventTruncated = Buffer.byteLength(text) > eventRemaining;
    if (eventTruncated) job.outputTruncated = true;
    job.updatedAt = now();
    if (eventText || !job[eventFlagKey]) {
      logEvent("job_output", { jobId: job.id, stream, text: eventText, truncated: job.outputTruncated });
      if (eventTruncated) job[eventFlagKey] = true;
    }
  }

  function finishJob(job, code, signal) {
    if (isFinished(job)) return;
    clearTimeout(job.timer);
    job.exitCode = code;
    job.signal = signal;
    job.completedAt = now();
    job.updatedAt = job.completedAt;
    job.status = job.cancelRequested ? "cancelled" : job.timedOut ? "timed_out" : code === 0 ? "completed" : "failed";
    job.ok = job.status === "completed";
    job.eventId = logEvent("job_finished", publicJob(job));
    pumpJobs();
    job.resolve?.(publicJob(job));
  }

  function waitForJob(jobId) {
    const job = jobs.get(jobId);
    if (!job) return Promise.reject(new Error(`Unknown job: ${jobId}`));
    if (isFinished(job)) return Promise.resolve(publicJob(job));
    return new Promise((resolve) => {
      job.resolve = resolve;
    });
  }

  function sendJob(response, jobId) {
    const job = jobs.get(jobId);
    if (!job) return send(response, 404, { error: `Unknown job: ${jobId}` });
    send(response, 200, { ok: true, job: publicJob(job) });
  }

  function cancelJob(response, jobId) {
    const job = jobs.get(jobId);
    if (!job) return send(response, 404, { error: `Unknown job: ${jobId}` });
    if (isFinished(job)) return send(response, 200, { ok: true, job: publicJob(job) });
    job.cancelRequested = true;
    if (job.status === "queued") finishJob(job, null, "cancelled");
    else job.child?.kill("SIGTERM");
    send(response, 202, { ok: true, job: publicJob(job) });
  }

  async function serveStatic(pathname, response) {
    const dist = join(root, "dist");
    const safePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const target = resolve(dist, safePath);
    if (!isInside(target, dist)) return send(response, 403, { error: "forbidden" });
    const file = existsSync(target) && (await stat(target)).isFile() ? target : join(dist, "index.html");
    response.writeHead(200, { "Content-Type": contentType(file) });
    createReadStream(file).pipe(response);
  }

  function publicJob(job) {
    const safeJob = {
      id: job.id,
      runId: job.runId,
      projectId: job.projectId,
      title: job.title,
      command: job.command ?? "daemon",
      args: job.args,
      status: job.status,
      ok: Boolean(job.ok),
      exitCode: job.exitCode,
      signal: job.signal,
      outputTruncated: job.outputTruncated,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      updatedAt: job.updatedAt,
      timeoutMs: job.timeoutMs,
      eventId: job.eventId,
      error: job.error
    };
    return Object.fromEntries(
      Object.entries(sanitizeObjectStrings(safeJob)).filter(([, value]) => value !== undefined)
    );
  }

  function jobSummary() {
    const summary = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0, timed_out: 0 };
    for (const job of jobs.values()) summary[job.status] = (summary[job.status] ?? 0) + 1;
    return summary;
  }

  function orchestratorSummary() {
    const latest = latestSessionId();
    return {
      sessions: orchestratorSessions.size,
      taskEvents: taskEvents.length,
      latestSessionId: latest ? redactSensitiveText(latest) : undefined
    };
  }

  function healthSnapshot() {
    return sanitizeObjectStrings({
      ok: true,
      daemon: "cognopticon",
      host: config.host,
      runtimeMode: "local_daemon",
      profile: publicHealthProfile(config.profile),
      allowedRootCount: config.allowedRoots.length,
      jobs: jobSummary(),
      orchestrator: orchestratorSummary()
    });
  }

  function latestSessionId() {
    return [...orchestratorSessions.keys()].at(-1);
  }

  function orchestratorState() {
    const latest = latestSessionId();
    return {
      ok: true,
      active: Boolean(latest),
      latestSessionId: latest ? redactSensitiveText(latest) : undefined,
      session: latest ? publicOrchestratorSession(orchestratorSessions.get(latest)) : undefined,
      taskEvents: taskEvents.slice(-200).map(publicOrchestratorTaskEvent),
      completedTaskIds: [...completedTaskIdsFromEvents(taskEvents)].map(redactSensitiveText)
    };
  }

  function hydrateDaemonState() {
    if (!existsSync(eventPath)) return;
    forEachFileLine(eventPath, (line) => {
      try {
        const event = sanitizeEvent(JSON.parse(line));
        hydrateOrchestratorEvent(event);
        hydrateJobEvent(event, { historical: true });
      } catch {
        // Ignore malformed historical daemon lines; live writes remain structured.
      }
    });
  }

  function hydrateOrchestratorEvent(event) {
    if (event?.type === "orchestrator_session_started" && typeof event.payload?.sessionId === "string") {
      orchestratorSessions.set(event.payload.sessionId, {
        ...event.payload,
        sessionId: event.payload.sessionId,
        mode: "orchestrator",
        startedAt: event.payload.startedAt ?? event.createdAt
      });
      return;
    }
    if ((event?.type === "orchestrator_task_completed" || event?.type === "orchestrator_task_reopened") && isOrchestratorTaskEvent(event.payload)) {
      taskEvents.push(event.payload);
    }
  }

  function publicOrchestratorSession(session) {
    if (!session) return undefined;
    return sanitizeObjectStrings({
      sessionId: session.sessionId,
      mode: "orchestrator",
      focusProjectId: session.focusProjectId,
      startedAt: session.startedAt,
      message: session.message
    });
  }

  function publicOrchestratorTaskEvent(event) {
    return sanitizeObjectStrings({
      id: event.id,
      sessionId: event.sessionId,
      taskId: event.taskId,
      projectId: event.projectId,
      label: event.label,
      completed: Boolean(event.completed),
      source: event.source,
      createdAt: event.createdAt
    });
  }

  function completedTaskIdsFromEvents(events) {
    const completed = new Set();
    for (const event of events) {
      if (event.completed) completed.add(event.taskId);
      else completed.delete(event.taskId);
    }
    return completed;
  }

  function daemonRunState() {
    const jobs = publicJobLedgerEntries();
    return {
      ok: true,
      jobs,
      runs: publicRunRecordsFromJobs(jobs)
    };
  }

  function publicJobLedgerEntries() {
    return [...jobLedger.values()]
      .map(publicJobLedgerEntry)
      .sort(compareUpdatedAt)
      .slice(0, maxPublicRunRecords);
  }

  function publicJobLedgerEntry(job) {
    const interrupted = Boolean(job.historical && !isFinishedStatus(job.status));
    const status = interrupted ? "failed" : job.status;
    const entry = {
      id: job.id,
      runId: job.runId,
      projectId: job.projectId,
      title: job.title,
      command: job.command,
      args: Array.isArray(job.args) ? job.args : [],
      status,
      ok: status === "completed" && Boolean(job.ok),
      exitCode: job.exitCode,
      signal: job.signal,
      outputTruncated: Boolean(job.outputTruncated),
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: interrupted ? job.completedAt ?? job.updatedAt : job.completedAt,
      updatedAt: job.updatedAt ?? job.completedAt ?? job.startedAt ?? job.createdAt,
      timeoutMs: job.timeoutMs,
      eventId: job.eventId,
      error: interrupted ? "Daemon restarted before this job reached a terminal event." : job.error,
      interrupted,
      events: publicJobTimelineEvents(job.events)
    };
    return Object.fromEntries(
      Object.entries(sanitizeObjectStrings(entry)).filter(([, value]) => value !== undefined)
    );
  }

  function publicRunRecordsFromJobs(jobs) {
    const runsById = new Map();
    for (const job of jobs) {
      const run = publicRunRecordFromJob(job);
      const previous = runsById.get(run.id);
      if (!previous || compareUpdatedAt(run, previous) < 0) runsById.set(run.id, run);
    }
    return [...runsById.values()].sort(compareUpdatedAt).slice(0, maxPublicRunRecords);
  }

  function publicRunRecordFromJob(job) {
    const commandText = [job.command, ...(Array.isArray(job.args) ? job.args : [])].filter(Boolean).join(" ").trim();
    return Object.fromEntries(Object.entries(sanitizeObjectStrings({
      id: job.runId ?? `job:${job.id}`,
      projectId: job.projectId ?? "local-runtime",
      title: job.title ?? (commandText ? `Daemon job: ${commandText}` : "Daemon job"),
      status: runStatusForJob(job.status),
      summary: runSummaryForJob(job, commandText),
      command: commandText || undefined,
      jobId: job.id,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt ?? job.completedAt ?? job.startedAt ?? job.createdAt
    })).filter(([, value]) => value !== undefined));
  }

  function runStatusForJob(status) {
    if (status === "queued") return "dispatched";
    if (status === "running") return "running";
    if (status === "completed") return "completed";
    return "failed";
  }

  function runSummaryForJob(job, commandText) {
    const label = commandText || "daemon job";
    if (job.interrupted) return "Daemon restarted before this job reached a terminal event.";
    if (job.status === "queued") return `Queued daemon job: ${label}`;
    if (job.status === "running") return `Daemon job ${job.id} running: ${label}`;
    if (job.status === "completed") return `${label} exited ${job.exitCode ?? 0}`;
    if (job.status === "timed_out") return `${label} timed out`;
    if (job.status === "cancelled") return `${label} cancelled`;
    if (typeof job.error === "string" && job.error) return `${label} failed: ${job.error}`;
    return `${label} exited ${job.exitCode ?? "unknown"}`;
  }

  function hydrateJobEvent(event, options = {}) {
    if (!event?.type?.startsWith?.("job_")) return;
    if (event.type === "job_output") {
      const jobId = typeof event.payload?.jobId === "string" ? event.payload.jobId : undefined;
      if (!jobId || !jobLedger.has(jobId)) return;
      const existing = jobLedger.get(jobId);
      existing.outputTruncated = Boolean(event.payload.truncated ?? existing.outputTruncated);
      existing.updatedAt = event.createdAt ?? existing.updatedAt;
      existing.historical = Boolean(existing.historical && options.historical);
      existing.events = appendJobTimelineEvent(existing.events, event);
      trimJobLedger();
      return;
    }
    if (!event.payload || typeof event.payload !== "object" || typeof event.payload.id !== "string") return;
    const existing = jobLedger.get(event.payload.id);
    const fields = jobLedgerFields(event.payload);
    const next = {
      ...(existing ?? { id: event.payload.id, args: [], status: "queued", createdAt: event.createdAt, updatedAt: event.createdAt }),
      ...fields,
      id: event.payload.id,
      historical: existing ? Boolean(existing.historical && options.historical) : Boolean(options.historical)
    };
    next.createdAt = next.createdAt ?? event.createdAt;
    next.updatedAt = fields.updatedAt ?? fields.completedAt ?? fields.startedAt ?? event.createdAt ?? next.updatedAt ?? next.createdAt;
    next.events = appendJobTimelineEvent(existing?.events, event);
    jobLedger.set(next.id, next);
    trimJobLedger();
  }

  function appendJobTimelineEvent(events = [], event) {
    const nextEvent = jobTimelineEvent(event);
    if (!nextEvent) return events;
    const nextEvents = [...events.filter((item) => item.id !== nextEvent.id), nextEvent];
    return nextEvents.sort(compareCreatedAt).slice(-80);
  }

  function publicJobTimelineEvents(events = []) {
    return events.map((event) => sanitizeObjectStrings(event)).filter(isPublicJobTimelineEvent).sort(compareCreatedAt);
  }

  function jobTimelineEvent(event) {
    const payload = event.payload ?? {};
    const summary = jobTimelineSummary(event.type, payload);
    if (!summary) return undefined;
    return Object.fromEntries(Object.entries({
      id: optionalString(event.id, 180) ?? makeId("job-event"),
      type: event.type,
      createdAt: optionalString(event.createdAt, 80),
      summary,
      stream: event.type === "job_output" ? optionalString(payload.stream, 20) : undefined,
      truncated: event.type === "job_output" ? Boolean(payload.truncated) : undefined,
      status: isJobStatus(payload.status) ? payload.status : undefined,
      exitCode: Number.isInteger(payload.exitCode) || payload.exitCode === null ? payload.exitCode : undefined,
      signal: typeof payload.signal === "string" || payload.signal === null ? payload.signal : undefined
    }).filter(([, value]) => value !== undefined));
  }

  function jobTimelineSummary(type, payload) {
    const commandText = [payload.command, ...(Array.isArray(payload.args) ? payload.args : [])].filter((item) => typeof item === "string" && item).join(" ").trim();
    if (type === "job_queued") return commandText ? `Queued ${commandText}` : "Job queued";
    if (type === "job_started") return commandText ? `Started ${commandText}` : "Job started";
    if (type === "job_output") {
      const stream = payload.stream === "stderr" ? "stderr" : "stdout";
      return `${stream} output observed${payload.truncated ? " (truncated)" : ""}`;
    }
    if (type === "job_timeout") return "Timeout signal sent";
    if (type === "job_finished") {
      const status = isJobStatus(payload.status) ? payload.status : "finished";
      const exit = Number.isInteger(payload.exitCode) ? ` exit ${payload.exitCode}` : "";
      return `${status}${exit}`.trim();
    }
    return undefined;
  }

  function jobLedgerFields(payload) {
    const fields = {
      runId: optionalString(payload.runId, 180),
      projectId: optionalString(payload.projectId, 180),
      title: optionalString(payload.title, 240),
      command: optionalString(payload.command, 200),
      args: Array.isArray(payload.args) ? payload.args.filter((item) => typeof item === "string").slice(0, 24) : undefined,
      status: isJobStatus(payload.status) ? payload.status : undefined,
      ok: payload.ok === undefined ? undefined : Boolean(payload.ok),
      exitCode: Number.isInteger(payload.exitCode) || payload.exitCode === null ? payload.exitCode : undefined,
      signal: typeof payload.signal === "string" || payload.signal === null ? payload.signal : undefined,
      outputTruncated: payload.outputTruncated === undefined ? undefined : Boolean(payload.outputTruncated),
      createdAt: optionalString(payload.createdAt, 80),
      startedAt: optionalString(payload.startedAt, 80),
      completedAt: optionalString(payload.completedAt, 80),
      updatedAt: optionalString(payload.updatedAt, 80),
      timeoutMs: Number.isFinite(Number(payload.timeoutMs)) ? Number(payload.timeoutMs) : undefined,
      eventId: optionalString(payload.eventId, 180),
      error: optionalString(payload.error, 500)
    };
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  }

  function trimJobLedger() {
    if (jobLedger.size <= maxJobLedgerRecords) return;
    const keep = new Set([...jobLedger.values()].sort(compareUpdatedAt).slice(0, maxJobLedgerRecords).map((job) => job.id));
    for (const id of jobLedger.keys()) {
      if (!keep.has(id)) jobLedger.delete(id);
    }
  }

  function logEvent(type, payload) {
    const id = makeId("daemon");
    const event = sanitizeEvent({ id, type, payload, createdAt: now() });
    hydrateJobEvent(event, { historical: false });
    writeFileSync(eventPath, `${JSON.stringify(event)}\n`, { flag: "a" });
    for (const client of eventClients) client.write(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`);
    return id;
  }

  function sanitizeEvent(event) {
    return {
      ...event,
      payload: sanitizeEventPayload(event.type, event.payload)
    };
  }

  function sanitizeEventLine(line) {
    try {
      const event = JSON.parse(line);
      const error = event?.payload?.error;
      if (event?.type === "action_failed" && typeof error === "string" && isRequestBoundaryMessage(error)) return undefined;
      return JSON.stringify(sanitizeEvent(event));
    } catch {
      return undefined;
    }
  }

  function sanitizeEventPayload(type, payload) {
    if (!payload || typeof payload !== "object") return payload;
    if (type === "action_failed") {
      return sanitizeActionFailureEventPayload(payload);
    }
    if (type === "job_queued" || type === "job_started" || type === "job_timeout" || type === "job_finished") {
      return sanitizeJobEventPayload(payload);
    }
    if (type === "job_output") {
      const text = typeof payload.text === "string"
        ? truncateUtf8Text(redactSensitiveText(payload.text), maxEventOutputBytes)
        : payload.text;
      return sanitizeObjectStrings({
        jobId: payload.jobId,
        stream: payload.stream,
        text,
        truncated: Boolean(payload.truncated)
      });
    }
    if (type === "file_opened") {
      const nextPayload = sanitizeObjectStrings(payload);
      if (typeof payload.path === "string") nextPayload.path = "[redacted path]";
      if (typeof nextPayload.message === "string") nextPayload.message = redactSensitiveText(nextPayload.message);
      return nextPayload;
    }
    return sanitizeObjectStrings(payload);
  }

  function sanitizeJobEventPayload(payload) {
    const safePayload = {
      id: payload.id,
      runId: payload.runId,
      projectId: payload.projectId,
      title: payload.title,
      command: payload.command,
      args: Array.isArray(payload.args) ? payload.args : [],
      status: payload.status,
      ok: Boolean(payload.ok),
      exitCode: payload.exitCode,
      signal: payload.signal,
      outputTruncated: Boolean(payload.outputTruncated),
      createdAt: payload.createdAt,
      startedAt: payload.startedAt,
      completedAt: payload.completedAt,
      updatedAt: payload.updatedAt,
      timeoutMs: payload.timeoutMs,
      eventId: payload.eventId,
      error: payload.error
    };
    return Object.fromEntries(
      Object.entries(sanitizeObjectStrings(safePayload)).filter(([, value]) => value !== undefined)
    );
  }

  function sanitizeActionFailureEventPayload(payload) {
    const safePayload = {
      error: typeof payload.error === "string" ? safeFailureMessage(redactSensitiveText(payload.error)) : payload.error,
      category: payload.category ?? (typeof payload.error === "string" ? failureCategory(payload.error) : undefined),
      action: payload.action,
      endpoint: payload.endpoint,
      method: payload.method,
      status: payload.status,
      requestId: payload.requestId
    };
    return Object.fromEntries(
      Object.entries(safePayload).filter(([, value]) => value !== undefined)
    );
  }

  function sanitizeObjectStrings(value) {
    if (Array.isArray(value)) return value.map(sanitizeObjectStrings);
    if (!value || typeof value !== "object") return typeof value === "string" ? redactSensitiveText(value) : value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeObjectStrings(item)]));
  }

  function redactSensitiveText(value) {
    return redactDaemonTokens(redactFilesystemPaths(redactKnownRoots(value, [root, stateDir, eventPath, ...config.allowedRoots])));
  }

  function allowedOrigin() {
    return config.allowedOrigin ?? config.allowedOrigins?.[0] ?? "http://127.0.0.1:5173";
  }

  function responseOriginFor(request) {
    const origin = request.headers.origin;
    if (!origin) return allowedOrigin();
    const allowed = new Set(config.allowedOrigins ?? [allowedOrigin()]);
    return allowed.has(origin) || isTrustedTokenOrigin(origin) ? origin : allowedOrigin();
  }

  function assertAllowedRequestOrigin(request) {
    const origin = request.headers.origin;
    if (!origin) return;
    if (isDaemonOrigin(origin)) return;
    const token = config.daemon?.accessToken;
    if (token && isTrustedTokenOrigin(origin)) {
      if (requestToken(request) !== token) throw new Error("Cognopticon daemon token is required for this origin");
      return;
    }
    const allowed = new Set(config.allowedOrigins ?? [allowedOrigin()]);
    if (!allowed.has(origin)) throw new Error(`Origin is not allowed: ${origin}`);
    if (token && requestToken(request) !== token) throw new Error("Cognopticon daemon token is required for this origin");
  }

  function jsonHeaders() {
    return {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": this?.cognopticonOrigin ?? allowedOrigin(),
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Cognopticon-Token"
    };
  }

  function sseHeaders() {
    return {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": this?.cognopticonOrigin ?? allowedOrigin()
    };
  }

  function send(response, status, body) {
    response.writeHead(status, jsonHeaders.call(response));
    response.end(JSON.stringify(body));
  }

  function sendOptions(response) {
    response.writeHead(204, jsonHeaders.call(response));
    response.end();
  }

  async function readJson(request) {
    const chunks = [];
    let total = 0;
    for await (const chunk of request) {
      total += chunk.length;
      if (total > maxRequestBytes) throw new Error(`Request body exceeds ${maxRequestBytes} bytes`);
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  }

  function makeId(prefix) {
    return `${prefix}:${Date.now()}:${randomId()}`;
  }

  function isDaemonOrigin(origin) {
    const port = config.port;
    return origin === `http://${config.host}:${port}` || origin === `http://localhost:${port}`;
  }

  function isTrustedTokenOrigin(origin) {
    if (!config.daemon?.accessToken) return false;
    try {
      const url = new URL(origin);
      return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    } catch {
      return false;
    }
  }

  function requestToken(request) {
    if (requestHasQueryToken(request)) throw new Error("Cognopticon daemon token must be sent in X-Cognopticon-Token header");
    const header = request.headers["x-cognopticon-token"];
    if (typeof header === "string") return header;
    if (Array.isArray(header)) return header[0];
    return undefined;
  }

  function failurePayloadFor(request, error) {
    const message = error instanceof Error ? error.message : String(error);
    const endpoint = requestEndpoint(request);
    return {
      error: safeFailureMessage(message),
      category: failureCategory(message),
      action: actionForEndpoint(endpoint),
      endpoint,
      method: request.method ?? "UNKNOWN",
      status: 500,
      requestId: makeId("request")
    };
  }

  function requestEndpoint(request) {
    try {
      return new URL(request.url ?? "/", `http://${config.host}:${config.port}`).pathname;
    } catch {
      return request.url ?? "/";
    }
  }

  return {
    server,
    config,
    root,
    eventPath,
    state: {
      jobs,
      queue,
      jobLedger,
      eventClients,
      orchestratorSessions,
      taskEvents
    }
  };
}

function publicProfile(profile, options = {}) {
  if (!profile) return undefined;
  return Object.fromEntries(Object.entries({
    id: profile.id,
    label: profile.label,
    deviceId: profile.deviceId,
    active: options.active,
    allowedRootCount: options.allowedRootCount ?? (Array.isArray(profile.allowedRoots) ? profile.allowedRoots.length : undefined)
  }).filter(([, value]) => value !== undefined));
}

function publicHealthProfile(profile) {
  if (!profile) return undefined;
  return {
    id: profile.id,
    label: profile.label,
    deviceId: profile.deviceId
  };
}

function publicProfiles(runtimeConfig, root) {
  const configured = runtimeConfig.profiles ?? {};
  const ids = new Set([runtimeConfig.activeProfile, ...Object.keys(configured)]);
  return [...ids].filter(Boolean).map((id) => {
    const profile = id === runtimeConfig.profile.id ? runtimeConfig.profile : normalizeProfile(root, id, configured[id] ?? {});
    return publicProfile(profile, { active: id === runtimeConfig.profile.id });
  });
}

function loadDemoWorkspace(root) {
  const dataRoot = join(root, "src", "data");
  const metadata = readJsonFile(join(dataRoot, "workspace-meta.json"));
  return {
    ...metadata,
    roots: readJsonFile(join(dataRoot, "workspace-roots.json")),
    projects: readJsonFile(join(dataRoot, "projects.json")),
    relationships: readJsonFile(join(dataRoot, "relationships.json"))
  };
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function startDaemon(options = {}) {
  const daemon = createDaemon(options);
  daemon.server.listen(daemon.config.port, daemon.config.host, () => {
    const address = daemon.server.address();
    const port = typeof address === "object" && address ? address.port : daemon.config.port;
    console.log(`Cognopticon local stack listening at http://${daemon.config.host}:${port}/`);
  });
  return daemon;
}

export function openPathSpawnSpec(path, platform = process.platform) {
  if (platform === "darwin") return { command: "open", args: [path] };
  if (platform === "win32") return { command: "explorer.exe", args: [path] };
  return { command: "xdg-open", args: [path] };
}

export function assertSafeDaemonCommand(command, args, cwd, config) {
  assertAllowlistedCommand(command, config.allowedCommands);
  if (isDestructiveCommand(command, args)) throw new Error("Destructive commands are not supported");
  assertConstrainedCommand(command, args, cwd, config);
}

export function assertConstrainedCommand(command, args, cwd, config) {
  if (command === "npm") {
    const script = args[0] === "run" ? args[1] : args[0];
    const allowedScripts = config.allowedNpmScripts ?? ["test", "lint", "validate:data"];
    if (!script || !allowedScripts.includes(script) || args.length > (args[0] === "run" ? 2 : 1)) {
      throw new Error(`npm command is not an approved verification script: ${args.join(" ")}`);
    }
    return;
  }
  if (command === "node") {
    if (args.some((arg) => arg === "-e" || arg === "--eval" || arg === "-p" || arg === "--print")) {
      throw new Error("node eval/print commands are not supported");
    }
    if (args.length !== 1 || !args[0].endsWith(".mjs") && !args[0].endsWith(".js")) {
      throw new Error("node commands must run one explicit local script");
    }
    resolveInsideAllowedRoots(resolve(cwd, args[0]), config.allowedRoots);
    return;
  }
  throw new Error(`Command has no daemon safety policy: ${command}`);
}

export function isDestructiveCommand(command, args) {
  return /rm|del|git/.test(command) || /--force|-rf|reset|push|commit|delete/i.test(args.join(" "));
}

function contentType(file) {
  return extname(file) === ".js" ? "text/javascript" : extname(file) === ".css" ? "text/css" : extname(file) === ".html" ? "text/html" : "application/octet-stream";
}

function isFinished(job) {
  return isFinishedStatus(job.status);
}

function isFinishedStatus(status) {
  return ["completed", "failed", "cancelled", "timed_out"].includes(status);
}

function isJobStatus(status) {
  return ["queued", "running", "completed", "failed", "cancelled", "timed_out"].includes(status);
}

function compareUpdatedAt(left, right) {
  const leftTime = String(left.updatedAt ?? left.completedAt ?? left.startedAt ?? left.createdAt ?? "");
  const rightTime = String(right.updatedAt ?? right.completedAt ?? right.startedAt ?? right.createdAt ?? "");
  return rightTime.localeCompare(leftTime);
}

function compareCreatedAt(left, right) {
  return String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? ""));
}

function isPublicJobTimelineEvent(value) {
  return Boolean(value)
    && typeof value === "object"
    && typeof value.id === "string"
    && typeof value.type === "string"
    && typeof value.createdAt === "string"
    && typeof value.summary === "string";
}

function optionalString(value, maxLength = 200) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function isRequestBoundaryError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return isRequestBoundaryMessage(message);
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function isOrchestratorTaskEvent(value) {
  return Boolean(value)
    && typeof value === "object"
    && typeof value.id === "string"
    && (value.sessionId === undefined || typeof value.sessionId === "string")
    && typeof value.taskId === "string"
    && typeof value.projectId === "string"
    && typeof value.label === "string"
    && typeof value.completed === "boolean"
    && (value.source === undefined || typeof value.source === "string")
    && typeof value.createdAt === "string";
}

function requestClose(response, onClose) {
  response.on("close", onClose);
  response.on("error", onClose);
}

function normalizeConfig(root, config) {
  return {
    ...config,
    allowedRoots: (config.allowedRoots ?? [root]).map((allowedRoot) => resolve(root, allowedRoot))
  };
}

function isInside(target, root) {
  const resolvedTarget = resolve(target);
  const resolvedRoot = resolve(root);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${sep}`);
}

function mergeConfig(base, override) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) result[key] = { ...(result[key] ?? {}), ...value };
    else result[key] = value;
  }
  return result;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return max;
  return Math.max(min, Math.min(max, value));
}

function forEachFileLine(path, onLine) {
  const fd = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const decoder = new TextDecoder();
  let pending = "";
  try {
    let bytesRead = 0;
    do {
      bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      const chunk = decoder.decode(buffer.subarray(0, bytesRead), { stream: bytesRead > 0 });
      const lines = `${pending}${chunk}`.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) onLine(trimmed);
      }
    } while (bytesRead > 0);

    const trimmed = pending.trim();
    if (trimmed) onLine(trimmed);
  } finally {
    closeSync(fd);
  }
}

function eventSnapshotLines(path, sanitizeLine = sanitizeVisibleEventLine, maxBytes = 262144) {
  if (!existsSync(path)) return [];
  const size = statSync(path).size;
  const readBytes = Math.min(size, maxBytes);
  const fd = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(readBytes);
  try {
    readSync(fd, buffer, 0, readBytes, size - readBytes);
  } finally {
    closeSync(fd);
  }
  const lines = buffer.toString("utf8").split("\n");
  if (size > readBytes) lines.shift();
  return lines.map((line) => line.trim()).filter(Boolean).map(sanitizeLine).filter(Boolean).slice(-50);
}

function truncateUtf8Text(value, maxBytes) {
  if (maxBytes <= 0) return "";
  const bytes = Buffer.byteLength(value);
  if (bytes <= maxBytes) return value;
  let text = Buffer.from(value).subarray(0, maxBytes).toString();
  while (Buffer.byteLength(text) > maxBytes) text = text.slice(0, -1);
  return text;
}

function sanitizeVisibleEventLine(line) {
  try {
    const event = JSON.parse(line);
    const error = event?.payload?.error;
    if (event?.type === "action_failed" && typeof error === "string") {
      if (isRequestBoundaryMessage(error)) return undefined;
      event.payload.error = safeFailureMessage(error);
      if (!event.payload.category) event.payload.category = failureCategory(error);
      return JSON.stringify(event);
    }
    return line;
  } catch {
    return undefined;
  }
}

function isRequestBoundaryMessage(message) {
  return message.startsWith("Origin is not allowed:")
    || message === "Cognopticon daemon token is required for this origin"
    || message === "Cognopticon daemon token must be sent in X-Cognopticon-Token header";
}

function requestHasQueryToken(request) {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    return url.searchParams.has("daemonToken");
  } catch {
    return false;
  }
}

function actionForEndpoint(endpoint) {
  if (endpoint === "/api/orchestrator/session") return "orchestrator_session";
  if (endpoint === "/api/orchestrator/task-event") return "orchestrator_task_event";
  if (endpoint === "/api/runs/state") return "run_state";
  if (endpoint === "/api/actions/run-command") return "run_command";
  if (endpoint === "/api/actions/open-path") return "open_path";
  if (endpoint === "/api/actions/open-editor") return "open_editor";
  if (endpoint === "/api/jobs" || endpoint.startsWith("/api/jobs/")) return "daemon_job";
  if (endpoint === "/api/events") return "event_stream";
  if (endpoint === "/api/workspace") return "workspace_load";
  return "daemon_request";
}

function failureCategory(message) {
  if (message.startsWith("Request body exceeds")) return "request_limit";
  if (message.startsWith("Unknown orchestrator session:")) return "orchestrator_session";
  if (
    message.includes("outside configured Cognopticon roots")
    || message.includes("not allowlisted")
    || message.includes("approved verification script")
    || message.includes("Destructive commands")
    || message.includes("not supported")
    || message.includes("no daemon safety policy")
  ) return "policy_block";
  if (message.includes("JSON")) return "invalid_request";
  return "daemon_error";
}

function safeFailureMessage(message) {
  if (message.startsWith("Path is outside configured Cognopticon roots")) return "Path is outside configured Cognopticon roots.";
  if (message.startsWith("Command is not allowlisted:")) return "Command is not allowlisted.";
  if (message.startsWith("Command has no daemon safety policy:")) return "Command has no daemon safety policy.";
  if (message.startsWith("npm command is not an approved verification script:")) return "npm command is not an approved verification script.";
  return redactFilesystemPaths(message);
}

function redactKnownRoots(message, roots) {
  const pathTailPattern = "[^\\r\\n\"'`]*";
  return roots.reduce((current, sensitiveRoot) => {
    if (typeof sensitiveRoot !== "string" || !sensitiveRoot) return current;
    return current.replace(new RegExp(`${escapeRegExp(resolve(sensitiveRoot))}${pathTailPattern}`, "g"), "[redacted path]");
  }, message);
}

function redactFilesystemPaths(message) {
  return message
    .replace(/\bfile:\/\/\/[^\s"'`]+/g, "file://[redacted path]")
    .replace(/(^|[\s([{]|:(?!\/\/))(?:[A-Za-z]:)?[\\/][^\s"'`]+/g, "$1[redacted path]");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactDaemonTokens(message) {
  return message.replace(/(daemonToken=)[^&#\s]+/g, "$1[redacted]");
}

if (process.argv[1] && resolve(process.argv[1]) === sourceFile) {
  startDaemon();
}
