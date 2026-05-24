import type { DaemonStatus } from "../agency/types";
import type { CognopticonEvent } from "../intelligence/types";

export interface DaemonActionResult {
  ok: boolean;
  actionId: string;
  eventId: string;
  message: string;
  stdout?: string;
  stderr?: string;
}

export interface DaemonJob {
  id: string;
  cwd: string;
  command: string;
  args: string[];
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "timed_out";
  ok: boolean;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  outputTruncated?: boolean;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  timeoutMs: number;
  eventId?: string;
  error?: string;
}

export interface DaemonJobResult {
  ok: boolean;
  jobId?: string;
  job?: DaemonJob;
  message: string;
}

export interface OrchestratorSessionResult {
  ok: boolean;
  sessionId?: string;
  mode: "orchestrator";
  eventId: string;
  focusProjectId?: string;
  visualizerUrl: string;
  message: string;
}

export interface OrchestratorTaskEventResult {
  ok: boolean;
  eventId: string;
  message: string;
  taskEvent?: {
    id: string;
    sessionId?: string;
    taskId: string;
    projectId: string;
    label: string;
    completed: boolean;
    createdAt: string;
  };
}

export interface OrchestratorTaskEvent {
  id: string;
  sessionId?: string;
  taskId: string;
  projectId: string;
  label: string;
  completed: boolean;
  source?: string;
  createdAt: string;
}

export interface OrchestratorStateResult {
  ok: boolean;
  active: boolean;
  latestSessionId?: string;
  session?: {
    sessionId: string;
    mode: "orchestrator";
    focusProjectId?: string;
    startedAt?: string;
    message?: string;
  };
  taskEvents: OrchestratorTaskEvent[];
  completedTaskIds: string[];
  message?: string;
}

const DEFAULT_DAEMON_URL = "http://127.0.0.1:8787";
const DAEMON_TOKEN_STORAGE_KEY = "cognopticon:daemonToken";

let inMemoryDaemonToken: string | undefined;
let daemonEventReconnectDelayMs = 1000;

export async function checkDaemonHealth(baseUrl?: string): Promise<DaemonStatus> {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("daemon") === "off") {
    return { online: false, url: baseUrl ?? DEFAULT_DAEMON_URL, checkedAt: new Date().toISOString(), error: "disabled by URL" };
  }
  let lastStatus: DaemonStatus | undefined;
  for (const candidateUrl of daemonCandidateUrls(baseUrl)) {
    lastStatus = await probeDaemonHealth(candidateUrl);
    if (lastStatus.online) return lastStatus;
  }
  return lastStatus ?? { online: false, url: baseUrl ?? DEFAULT_DAEMON_URL, checkedAt: new Date().toISOString(), error: "not checked" };
}

async function probeDaemonHealth(baseUrl: string): Promise<DaemonStatus> {
  try {
    const response = await fetch(`${baseUrl}/api/health`, { method: "GET", headers: daemonAuthHeaders() });
    if (!response.ok) return { online: false, url: baseUrl, checkedAt: new Date().toISOString(), error: `HTTP ${response.status}` };
    const body = await readDaemonJson(response);
    if (body.ok !== true || body.daemon !== "cognopticon") {
      return { online: false, url: baseUrl, checkedAt: new Date().toISOString(), error: "not a Cognopticon daemon" };
    }
    return { online: true, url: baseUrl, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { online: false, url: baseUrl, checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "Unknown daemon error" };
  }
}

function daemonCandidateUrls(baseUrl?: string) {
  const candidates = [];
  if (baseUrl) candidates.push(baseUrl);
  else if (typeof window !== "undefined" && window.location?.origin?.startsWith("http")) candidates.push(window.location.origin);
  candidates.push(DEFAULT_DAEMON_URL);
  return [...new Set(candidates)];
}

export async function runDaemonCommand(payload: { cwd: string; command: string; args?: string[] }, baseUrl = DEFAULT_DAEMON_URL): Promise<DaemonActionResult> {
  try {
    const response = await fetch(`${baseUrl}/api/actions/run-command`, {
      method: "POST",
      headers: daemonJsonHeaders(),
      body: JSON.stringify(payload)
    });
    if (!response.ok) return { ok: false, actionId: "run-command", eventId: crypto.randomUUID(), message: `Daemon rejected command: HTTP ${response.status}` };
    return response.json() as Promise<DaemonActionResult>;
  } catch (error) {
    return { ok: false, actionId: "run-command", eventId: crypto.randomUUID(), message: error instanceof Error ? error.message : "Daemon command failed" };
  }
}

export async function createDaemonJob(payload: { cwd: string; command: string; args?: string[]; timeoutMs?: number }, baseUrl = DEFAULT_DAEMON_URL): Promise<DaemonJobResult> {
  try {
    const response = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: daemonJsonHeaders(),
      body: JSON.stringify(payload)
    });
    const body = await readDaemonJson(response);
    const message = typeof body.error === "string" ? body.error : `Daemon rejected job: HTTP ${response.status}`;
    if (!response.ok) return { ok: false, message };
    const jobId = typeof body.jobId === "string" ? body.jobId : undefined;
    const job = isDaemonJob(body.job) ? body.job : undefined;
    return { ok: Boolean(jobId), jobId, job, message: jobId ? `Daemon job ${jobId} queued.` : "Daemon did not return a job id." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Daemon job failed" };
  }
}

export async function getDaemonJob(jobId: string, baseUrl = DEFAULT_DAEMON_URL): Promise<DaemonJobResult> {
  try {
    const response = await fetch(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`, { headers: daemonAuthHeaders() });
    const body = await readDaemonJson(response);
    const message = typeof body.error === "string" ? body.error : `Daemon rejected job lookup: HTTP ${response.status}`;
    if (!response.ok) return { ok: false, message };
    const job = isDaemonJob(body.job) ? body.job : undefined;
    return { ok: Boolean(job), jobId, job, message: job?.status ?? "job loaded" };
  } catch (error) {
    return { ok: false, jobId, message: error instanceof Error ? error.message : "Daemon job lookup failed" };
  }
}

export async function openDaemonPath(payload: { path: string }, baseUrl = DEFAULT_DAEMON_URL): Promise<DaemonActionResult> {
  try {
    const response = await fetch(`${baseUrl}/api/actions/open-path`, {
      method: "POST",
      headers: daemonJsonHeaders(),
      body: JSON.stringify(payload)
    });
    if (!response.ok) return { ok: false, actionId: "open-path", eventId: crypto.randomUUID(), message: `Daemon rejected path: HTTP ${response.status}` };
    return response.json() as Promise<DaemonActionResult>;
  } catch (error) {
    return { ok: false, actionId: "open-path", eventId: crypto.randomUUID(), message: error instanceof Error ? error.message : "Daemon path action failed" };
  }
}

export async function startOrchestratorSession(payload: { focusProjectId: string; visualizerUrl: string }, baseUrl = DEFAULT_DAEMON_URL): Promise<OrchestratorSessionResult> {
  try {
    const response = await fetch(`${baseUrl}/api/orchestrator/session`, {
      method: "POST",
      headers: daemonJsonHeaders(),
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return {
        ok: false,
        mode: "orchestrator",
        eventId: crypto.randomUUID(),
        focusProjectId: payload.focusProjectId,
        visualizerUrl: payload.visualizerUrl,
        message: `Daemon rejected orchestrator session: HTTP ${response.status}`
      };
    }
    return response.json() as Promise<OrchestratorSessionResult>;
  } catch (error) {
    return {
      ok: false,
      mode: "orchestrator",
      eventId: crypto.randomUUID(),
      focusProjectId: payload.focusProjectId,
      visualizerUrl: payload.visualizerUrl,
      message: error instanceof Error ? error.message : "Daemon orchestrator session failed"
    };
  }
}

export async function recordOrchestratorTaskEvent(payload: {
  sessionId?: string;
  taskId: string;
  projectId: string;
  label: string;
  completed: boolean;
}, baseUrl = DEFAULT_DAEMON_URL): Promise<OrchestratorTaskEventResult> {
  try {
    const response = await fetch(`${baseUrl}/api/orchestrator/task-event`, {
      method: "POST",
      headers: daemonJsonHeaders(),
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return {
        ok: false,
        eventId: crypto.randomUUID(),
        message: `Daemon rejected task event: HTTP ${response.status}`
      };
    }
    return response.json() as Promise<OrchestratorTaskEventResult>;
  } catch (error) {
    return {
      ok: false,
      eventId: crypto.randomUUID(),
      message: error instanceof Error ? error.message : "Daemon task event failed"
    };
  }
}

export async function getOrchestratorState(baseUrl = DEFAULT_DAEMON_URL): Promise<OrchestratorStateResult> {
  try {
    const response = await fetch(`${baseUrl}/api/orchestrator/state`, { headers: daemonAuthHeaders() });
    const body = await readDaemonJson(response);
    if (!response.ok) {
      return { ok: false, active: false, taskEvents: [], completedTaskIds: [], message: `Daemon rejected orchestrator state: HTTP ${response.status}` };
    }
    if (!isOrchestratorStateResult(body)) {
      return { ok: false, active: false, taskEvents: [], completedTaskIds: [], message: "Daemon returned malformed orchestrator state." };
    }
    return body;
  } catch (error) {
    return {
      ok: false,
      active: false,
      taskEvents: [],
      completedTaskIds: [],
      message: error instanceof Error ? error.message : "Daemon orchestrator state failed"
    };
  }
}

export function subscribeDaemonEvents(onEvent: (event: CognopticonEvent) => void, baseUrl = DEFAULT_DAEMON_URL) {
  const controller = new AbortController();
  void streamDaemonEvents(onEvent, baseUrl, controller.signal);
  return () => controller.abort();
}

const daemonEventTypes = [
  "orchestrator_session_started",
  "orchestrator_task_completed",
  "orchestrator_task_reopened",
  "job_queued",
  "job_started",
  "job_output",
  "job_timeout",
  "job_finished",
  "file_opened",
  "command_executed",
  "action_failed"
] as const;

export function normalizeDaemonEvent(event: { id?: string; type?: string; payload?: unknown; createdAt?: string }): CognopticonEvent | null {
  if (!event.id || !event.type || !daemonEventTypes.includes(event.type as (typeof daemonEventTypes)[number])) return null;
  if (event.type === "action_failed" && isDaemonRequestBoundaryFailure(event.payload)) return null;
  const normalizedPayload = event.type === "action_failed" ? sanitizeActionFailurePayload(event.payload) : event.payload;
  const payload = normalizedPayload as { projectId?: string; focusProjectId?: string; taskId?: string; id?: string } | undefined;
  return {
    id: event.id,
    type: event.type as CognopticonEvent["type"],
    workspaceId: "local",
    nodeId: payload?.projectId ?? payload?.focusProjectId,
    missionId: payload?.taskId ?? payload?.id,
    payload: normalizedPayload,
    createdAt: event.createdAt ?? new Date().toISOString()
  };
}

export function isDaemonRequestBoundaryFailure(payload: unknown) {
  const error = (payload as { error?: unknown } | undefined)?.error;
  return typeof error === "string" && isRequestBoundaryMessage(error);
}

function isRequestBoundaryMessage(message: string) {
  return message.startsWith("Origin is not allowed:")
    || message === "Cognopticon daemon token is required for this origin"
    || message === "Cognopticon daemon token must be sent in X-Cognopticon-Token header";
}

function sanitizeActionFailurePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return payload;
  const nextPayload = { ...(payload as Record<string, unknown>) };
  if (typeof nextPayload.error === "string") nextPayload.error = sanitizeDaemonErrorMessage(nextPayload.error);
  return nextPayload;
}

export function sanitizeDaemonErrorMessage(message: string) {
  if (message.startsWith("Path is outside configured Cognopticon roots")) return "Path is outside configured Cognopticon roots.";
  if (message.startsWith("Command is not allowlisted:")) return "Command is not allowlisted.";
  if (message.startsWith("Command has no daemon safety policy:")) return "Command has no daemon safety policy.";
  if (message.startsWith("npm command is not an approved verification script:")) return "npm command is not an approved verification script.";
  return message.replace(/(^|[\s([{:])(?:[A-Za-z]:)?[\\/][^\s"'`]+/g, "$1[redacted path]");
}

function isDaemonJob(value: unknown): value is DaemonJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<DaemonJob>;
  return typeof job.id === "string"
    && typeof job.cwd === "string"
    && typeof job.command === "string"
    && Array.isArray(job.args)
    && typeof job.status === "string"
    && typeof job.ok === "boolean"
    && typeof job.createdAt === "string"
    && typeof job.updatedAt === "string"
    && typeof job.timeoutMs === "number";
}

function isOrchestratorStateResult(value: unknown): value is OrchestratorStateResult {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<OrchestratorStateResult>;
  return state.ok === true
    && typeof state.active === "boolean"
    && (state.latestSessionId === undefined || typeof state.latestSessionId === "string")
    && (state.session === undefined || isOrchestratorSession(state.session))
    && Array.isArray(state.taskEvents)
    && state.taskEvents.every(isOrchestratorTaskEvent)
    && Array.isArray(state.completedTaskIds)
    && state.completedTaskIds.every((item) => typeof item === "string");
}

function isOrchestratorSession(value: unknown): value is NonNullable<OrchestratorStateResult["session"]> {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<NonNullable<OrchestratorStateResult["session"]>>;
  return typeof session.sessionId === "string"
    && session.mode === "orchestrator"
    && (session.focusProjectId === undefined || typeof session.focusProjectId === "string")
    && (session.startedAt === undefined || typeof session.startedAt === "string")
    && (session.message === undefined || typeof session.message === "string");
}

function isOrchestratorTaskEvent(value: unknown): value is OrchestratorTaskEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<OrchestratorTaskEvent>;
  return typeof event.id === "string"
    && (event.sessionId === undefined || typeof event.sessionId === "string")
    && typeof event.taskId === "string"
    && typeof event.projectId === "string"
    && typeof event.label === "string"
    && typeof event.completed === "boolean"
    && (event.source === undefined || typeof event.source === "string")
    && typeof event.createdAt === "string";
}

async function readDaemonJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function daemonJsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...daemonAuthHeaders() };
}

function daemonAuthHeaders(): Record<string, string> {
  const token = daemonToken();
  return token ? { "X-Cognopticon-Token": token } : {};
}

async function streamDaemonEvents(onEvent: (event: CognopticonEvent) => void, baseUrl: string, signal: AbortSignal) {
  while (!signal.aborted) {
    try {
      await readDaemonEventStream(onEvent, baseUrl, signal);
    } catch {
      // The app treats event streaming as best-effort; health and command calls surface failures.
    }
    if (!signal.aborted) await delayDaemonEventReconnect(signal);
  }
}

async function readDaemonEventStream(onEvent: (event: CognopticonEvent) => void, baseUrl: string, signal: AbortSignal) {
  const response = await fetch(`${baseUrl}/api/events`, {
    headers: daemonAuthHeaders(),
    signal,
    cache: "no-store"
  });
  if (!response.ok || !response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "message";
  let dataLines: string[] = [];

  const dispatch = () => {
    const data = dataLines.join("\n");
    const currentEventType = eventType;
    eventType = "message";
    dataLines = [];
    if (!data) return;
    dispatchDaemonStreamEvent(currentEventType, data, onEvent);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let lineEnd = buffer.indexOf("\n");
    while (lineEnd >= 0) {
      const rawLine = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line === "") dispatch();
      else if (line.startsWith("event:")) eventType = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      lineEnd = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    for (const line of buffer.split(/\r?\n/)) {
      if (line === "") dispatch();
      else if (line.startsWith("event:")) eventType = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
  }
  dispatch();
}

function delayDaemonEventReconnect(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timeout = globalThis.setTimeout(resolve, daemonEventReconnectDelayMs);
    signal.addEventListener("abort", () => {
      globalThis.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

function dispatchDaemonStreamEvent(eventType: string, data: string, onEvent: (event: CognopticonEvent) => void) {
  try {
    if (eventType === "snapshot") {
      const lines = JSON.parse(data) as string[];
      for (const line of lines) {
        const event = normalizeDaemonEvent(JSON.parse(line));
        if (event) onEvent(event);
      }
      return;
    }
    if (!daemonEventTypes.includes(eventType as (typeof daemonEventTypes)[number])) return;
    const event = normalizeDaemonEvent(JSON.parse(data));
    if (event) onEvent(event);
  } catch {
    // Ignore malformed historical or live daemon output.
  }
}

export function daemonToken() {
  if (typeof window === "undefined") return undefined;
  clearLegacyDaemonTokenStorage();
  if (new URLSearchParams(window.location.search).has("daemonToken")) stripDaemonTokenFromVisibleUrl();
  const token = daemonTokenFromLocation();
  if (token) {
    inMemoryDaemonToken = token;
    sessionSet(DAEMON_TOKEN_STORAGE_KEY, token);
    stripDaemonTokenFromVisibleUrl();
    return token;
  }
  if (inMemoryDaemonToken) return inMemoryDaemonToken;
  inMemoryDaemonToken = sessionGet(DAEMON_TOKEN_STORAGE_KEY);
  return inMemoryDaemonToken;
}

function daemonTokenFromLocation() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(hash).get("daemonToken") ?? undefined;
}

function stripDaemonTokenFromVisibleUrl() {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has("daemonToken")) {
      url.searchParams.delete("daemonToken");
      changed = true;
    }
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    const hashParams = new URLSearchParams(hash);
    if (hashParams.has("daemonToken")) {
      hashParams.delete("daemonToken");
      const nextHash = hashParams.toString();
      url.hash = nextHash ? `#${nextHash}` : "";
      changed = true;
    }
    if (changed) window.history.replaceState(window.history.state, document.title, url.toString());
  } catch {
    // URL cleanup is a defense-in-depth convenience; auth still uses headers.
  }
}

function sessionGet(key: string) {
  try {
    return window.sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function sessionSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Keep the token in memory for this page lifetime when storage is unavailable.
  }
}

function clearLegacyDaemonTokenStorage() {
  try {
    window.localStorage.removeItem(DAEMON_TOKEN_STORAGE_KEY);
  } catch {
    // Best-effort cleanup for old builds that persisted daemon tokens.
  }
}

export function __resetDaemonTokenForTests() {
  inMemoryDaemonToken = undefined;
  daemonEventReconnectDelayMs = 1000;
}

export function __setDaemonEventReconnectDelayForTests(value: number) {
  daemonEventReconnectDelayMs = value;
}
