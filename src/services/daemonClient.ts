import type { DaemonHealthJobSummary, DaemonStatus } from "../agency/types";
import type { CognopticonEvent } from "../intelligence/types";
import type { RunRecord } from "../types/cognopticon";

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
  runId?: string;
  projectId?: string;
  title?: string;
  command: string;
  args: string[];
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "timed_out";
  ok: boolean;
  exitCode?: number | null;
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

export interface DaemonRunJob {
  id: string;
  runId?: string;
  projectId?: string;
  title?: string;
  command: string;
  args: string[];
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "timed_out";
  ok: boolean;
  exitCode?: number | null;
  signal?: string | null;
  outputTruncated?: boolean;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  timeoutMs?: number;
  eventId?: string;
  error?: string;
  interrupted?: boolean;
  events?: DaemonRunEvent[];
}

export interface DaemonRunEvent {
  id: string;
  type: string;
  createdAt: string;
  summary: string;
  stream?: string;
  truncated?: boolean;
  status?: DaemonRunJob["status"];
  exitCode?: number | null;
  signal?: string | null;
}

export interface DaemonRunStateResult {
  ok: boolean;
  runs: RunRecord[];
  jobs: DaemonRunJob[];
  message?: string;
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
const daemonHealthJobStatuses = ["queued", "running", "completed", "failed", "cancelled", "timed_out"] as const;

let inMemoryDaemonToken: string | undefined;
let daemonEventReconnectDelayMs = 1000;

export async function checkDaemonHealth(baseUrl?: string): Promise<DaemonStatus> {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("daemon") === "off") {
    return { online: false, url: baseUrl ?? DEFAULT_DAEMON_URL, checkedAt: new Date().toISOString(), runtimeMode: "offline", error: "disabled by URL" };
  }
  let lastStatus: DaemonStatus | undefined;
  for (const candidateUrl of daemonCandidateUrls(baseUrl)) {
    lastStatus = await probeDaemonHealth(candidateUrl);
    if (lastStatus.online) return lastStatus;
  }
  return lastStatus ?? { online: false, url: baseUrl ?? DEFAULT_DAEMON_URL, checkedAt: new Date().toISOString(), runtimeMode: "offline", error: "not checked" };
}

async function probeDaemonHealth(baseUrl: string): Promise<DaemonStatus> {
  try {
    const response = await fetch(`${baseUrl}/api/health`, { method: "GET", headers: daemonAuthHeaders() });
    if (!response.ok) return { online: false, url: baseUrl, checkedAt: new Date().toISOString(), runtimeMode: "offline", error: `HTTP ${response.status}` };
    const body = await readDaemonJson(response);
    if (body.ok !== true || body.daemon !== "cognopticon") {
      return { online: false, url: baseUrl, checkedAt: new Date().toISOString(), runtimeMode: "offline", error: "not a Cognopticon daemon" };
    }
    return {
      online: true,
      url: baseUrl,
      checkedAt: new Date().toISOString(),
      runtimeMode: "local_daemon",
      profile: sanitizeHealthProfile(body.profile),
      allowedRootCount: nonnegativeInteger(body.allowedRootCount),
      jobs: sanitizeHealthJobSummary(body.jobs),
      orchestrator: sanitizeHealthOrchestrator(body.orchestrator)
    };
  } catch (error) {
    return { online: false, url: baseUrl, checkedAt: new Date().toISOString(), runtimeMode: "offline", error: error instanceof Error ? sanitizeDaemonErrorMessage(error.message) : "Unknown daemon error" };
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
    if (!response.ok) {
      const body = await readDaemonJson(response);
      const message = typeof body.error === "string" ? sanitizeDaemonErrorMessage(body.error) : `Daemon rejected command: HTTP ${response.status}`;
      return { ok: false, actionId: "run-command", eventId: crypto.randomUUID(), message };
    }
    const body = await response.json();
    return sanitizeDaemonActionResult(body, "run-command");
  } catch (error) {
    return { ok: false, actionId: "run-command", eventId: crypto.randomUUID(), message: error instanceof Error ? sanitizeDaemonErrorMessage(error.message) : "Daemon command failed" };
  }
}

export async function createDaemonJob(payload: { cwd: string; command: string; args?: string[]; timeoutMs?: number; runId?: string; projectId?: string; title?: string }, baseUrl = DEFAULT_DAEMON_URL): Promise<DaemonJobResult> {
  try {
    const response = await fetch(`${baseUrl}/api/jobs`, {
      method: "POST",
      headers: daemonJsonHeaders(),
      body: JSON.stringify(payload)
    });
    const body = await readDaemonJson(response);
    const message = typeof body.error === "string" ? sanitizeDaemonErrorMessage(body.error) : `Daemon rejected job: HTTP ${response.status}`;
    if (!response.ok) return { ok: false, message };
    const jobId = typeof body.jobId === "string" ? body.jobId : undefined;
    const job = sanitizeDaemonJob(body.job);
    return { ok: Boolean(jobId), jobId, job, message: jobId ? `Daemon job ${jobId} queued.` : "Daemon did not return a job id." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? sanitizeDaemonErrorMessage(error.message) : "Daemon job failed" };
  }
}

export async function getDaemonRunState(baseUrl = DEFAULT_DAEMON_URL): Promise<DaemonRunStateResult> {
  try {
    const response = await fetch(`${baseUrl}/api/runs/state`, { headers: daemonAuthHeaders() });
    const body = await readDaemonJson(response);
    if (!response.ok) {
      return { ok: false, runs: [], jobs: [], message: `Daemon rejected run state: HTTP ${response.status}` };
    }
    if (!isDaemonRunStateResult(body)) {
      return { ok: false, runs: [], jobs: [], message: "Daemon returned malformed run state." };
    }
    return sanitizeDaemonRunState(body);
  } catch (error) {
    return { ok: false, runs: [], jobs: [], message: error instanceof Error ? sanitizeDaemonErrorMessage(error.message) : "Daemon run state failed" };
  }
}

export async function getDaemonJob(jobId: string, baseUrl = DEFAULT_DAEMON_URL): Promise<DaemonJobResult> {
  try {
    const response = await fetch(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`, { headers: daemonAuthHeaders() });
    const body = await readDaemonJson(response);
    const message = typeof body.error === "string" ? sanitizeDaemonErrorMessage(body.error) : `Daemon rejected job lookup: HTTP ${response.status}`;
    if (!response.ok) return { ok: false, message };
    const job = sanitizeDaemonJob(body.job);
    return { ok: Boolean(job), jobId, job, message: job?.status ?? "job loaded" };
  } catch (error) {
    return { ok: false, jobId, message: error instanceof Error ? sanitizeDaemonErrorMessage(error.message) : "Daemon job lookup failed" };
  }
}

export async function openDaemonPath(payload: { path: string }, baseUrl = DEFAULT_DAEMON_URL): Promise<DaemonActionResult> {
  try {
    const response = await fetch(`${baseUrl}/api/actions/open-path`, {
      method: "POST",
      headers: daemonJsonHeaders(),
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = await readDaemonJson(response);
      const message = typeof body.error === "string" ? sanitizeDaemonErrorMessage(body.error) : `Daemon rejected path: HTTP ${response.status}`;
      return { ok: false, actionId: "open-path", eventId: crypto.randomUUID(), message };
    }
    const body = await response.json();
    return sanitizeDaemonActionResult(body, "open-path");
  } catch (error) {
    return { ok: false, actionId: "open-path", eventId: crypto.randomUUID(), message: error instanceof Error ? sanitizeDaemonErrorMessage(error.message) : "Daemon path action failed" };
  }
}

function sanitizeDaemonActionResult(value: unknown, fallbackActionId: string): DaemonActionResult {
  const result = value && typeof value === "object" ? value as Partial<DaemonActionResult> : {};
  return {
    ok: Boolean(result.ok),
    actionId: typeof result.actionId === "string" ? result.actionId : fallbackActionId,
    eventId: typeof result.eventId === "string" ? result.eventId : crypto.randomUUID(),
    message: typeof result.message === "string" ? sanitizeDaemonErrorMessage(result.message) : "Daemon action completed.",
    stdout: typeof result.stdout === "string" ? sanitizeDaemonErrorMessage(result.stdout) : undefined,
    stderr: typeof result.stderr === "string" ? sanitizeDaemonErrorMessage(result.stderr) : undefined
  };
}

export async function startOrchestratorSession(payload: { focusProjectId: string; visualizerUrl: string }, baseUrl = DEFAULT_DAEMON_URL): Promise<OrchestratorSessionResult> {
  try {
    const response = await fetch(`${baseUrl}/api/orchestrator/session`, {
      method: "POST",
      headers: daemonJsonHeaders(),
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = await readDaemonJson(response);
      const message = typeof body.error === "string" ? sanitizeDaemonErrorMessage(body.error) : `Daemon rejected orchestrator session: HTTP ${response.status}`;
      return {
        ok: false,
        mode: "orchestrator",
        eventId: crypto.randomUUID(),
        focusProjectId: payload.focusProjectId,
        visualizerUrl: payload.visualizerUrl,
        message
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
      message: error instanceof Error ? sanitizeDaemonErrorMessage(error.message) : "Daemon orchestrator session failed"
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
      const body = await readDaemonJson(response);
      const message = typeof body.error === "string" ? sanitizeDaemonErrorMessage(body.error) : `Daemon rejected task event: HTTP ${response.status}`;
      return {
        ok: false,
        eventId: crypto.randomUUID(),
        message
      };
    }
    return response.json() as Promise<OrchestratorTaskEventResult>;
  } catch (error) {
    return {
      ok: false,
      eventId: crypto.randomUUID(),
      message: error instanceof Error ? sanitizeDaemonErrorMessage(error.message) : "Daemon task event failed"
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
      message: error instanceof Error ? sanitizeDaemonErrorMessage(error.message) : "Daemon orchestrator state failed"
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
  const normalizedPayload = event.type === "action_failed" ? sanitizeActionFailurePayload(event.payload) : sanitizeDaemonPayload(event.payload);
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
  return sanitizeDaemonPayload(nextPayload);
}

const daemonPayloadProvenanceKeys = new Set(["action", "category", "endpoint", "method", "requestId", "sessionId", "jobId", "id", "projectId", "taskId", "focusProjectId", "status", "stream"]);

function sanitizeDaemonPayload(value: unknown, key?: string): unknown {
  if (typeof value === "string") return key && daemonPayloadProvenanceKeys.has(key) ? value : sanitizeDaemonErrorMessage(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeDaemonPayload(item, key));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([entryKey, item]) => [entryKey, sanitizeDaemonPayload(item, entryKey)]));
}

export function sanitizeDaemonErrorMessage(message: string) {
  if (message.startsWith("Path is outside configured Cognopticon roots")) return "Path is outside configured Cognopticon roots.";
  if (message.startsWith("Command is not allowlisted:")) return "Command is not allowlisted.";
  if (message.startsWith("Command has no daemon safety policy:")) return "Command has no daemon safety policy.";
  if (message.startsWith("npm command is not an approved verification script:")) return "npm command is not an approved verification script.";
  return message
    .replace(/(daemonToken=)[^&#\s]+/gi, "$1[redacted]")
    .replace(/(X-Cognopticon-Token[:=]\s*)[^\s]+/gi, "$1[redacted]")
    .replace(/(^|[\s([{:])(?:[A-Za-z]:)?[\\/][^\s"'`]+/g, "$1[redacted path]");
}

function sanitizeHealthProfile(value: unknown): DaemonStatus["profile"] {
  if (!value || typeof value !== "object") return undefined;
  const profile = value as Record<string, unknown>;
  const safeProfile = {
    id: optionalHealthString(profile.id, 80),
    label: optionalHealthString(profile.label, 120),
    deviceId: optionalHealthString(profile.deviceId, 80)
  };
  return Object.values(safeProfile).some(Boolean) ? safeProfile : undefined;
}

function sanitizeHealthJobSummary(value: unknown): DaemonHealthJobSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  let hasCount = false;
  const summary = Object.fromEntries(daemonHealthJobStatuses.map((status) => {
    const count = nonnegativeInteger(record[status]) ?? 0;
    if (count > 0 || record[status] !== undefined) hasCount = true;
    return [status, count];
  })) as DaemonHealthJobSummary;
  return hasCount ? summary : undefined;
}

function sanitizeHealthOrchestrator(value: unknown): DaemonStatus["orchestrator"] {
  if (!value || typeof value !== "object") return undefined;
  const orchestrator = value as Record<string, unknown>;
  const safeSummary = {
    sessions: nonnegativeInteger(orchestrator.sessions),
    taskEvents: nonnegativeInteger(orchestrator.taskEvents),
    latestSessionId: optionalHealthString(orchestrator.latestSessionId, 120)
  };
  return Object.values(safeSummary).some((item) => item !== undefined) ? safeSummary : undefined;
}

function optionalHealthString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return sanitizeDaemonErrorMessage(trimmed).slice(0, maxLength);
}

function nonnegativeInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function sanitizeDaemonJob(value: unknown): DaemonJob | undefined {
  if (!isDaemonJob(value)) return undefined;
  const job: DaemonJob = {
    id: sanitizeDaemonErrorMessage(value.id),
    command: sanitizeDaemonErrorMessage(value.command),
    args: value.args.map(sanitizeDaemonErrorMessage),
    status: value.status,
    ok: value.ok,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    timeoutMs: value.timeoutMs
  };
  if (value.runId !== undefined) job.runId = sanitizeDaemonErrorMessage(value.runId);
  if (value.projectId !== undefined) job.projectId = sanitizeDaemonErrorMessage(value.projectId);
  if (value.title !== undefined) job.title = sanitizeDaemonErrorMessage(value.title);
  if (value.exitCode !== undefined) job.exitCode = value.exitCode;
  if (value.outputTruncated !== undefined) job.outputTruncated = value.outputTruncated;
  if (value.startedAt !== undefined) job.startedAt = value.startedAt;
  if (value.completedAt !== undefined) job.completedAt = value.completedAt;
  if (value.eventId !== undefined) job.eventId = sanitizeDaemonErrorMessage(value.eventId);
  if (value.error !== undefined) job.error = sanitizeDaemonErrorMessage(value.error);
  return job;
}

function sanitizeDaemonRunState(value: DaemonRunStateResult): DaemonRunStateResult {
  return {
    ok: true,
    runs: value.runs.map(sanitizeRunRecord),
    jobs: value.jobs.map(sanitizeDaemonRunJob),
    message: value.message ? sanitizeDaemonErrorMessage(value.message) : undefined
  };
}

function sanitizeRunRecord(value: RunRecord): RunRecord {
  return {
    ...value,
    id: sanitizeDaemonErrorMessage(value.id),
    projectId: sanitizeDaemonErrorMessage(value.projectId),
    title: sanitizeDaemonErrorMessage(value.title),
    summary: sanitizeDaemonErrorMessage(value.summary),
    command: value.command ? sanitizeDaemonErrorMessage(value.command) : undefined,
    jobId: value.jobId ? sanitizeDaemonErrorMessage(value.jobId) : undefined
  };
}

function sanitizeDaemonRunJob(value: DaemonRunJob): DaemonRunJob {
  const job: DaemonRunJob = {
    ...value,
    id: sanitizeDaemonErrorMessage(value.id),
    command: sanitizeDaemonErrorMessage(value.command),
    args: value.args.map(sanitizeDaemonErrorMessage),
    runId: value.runId ? sanitizeDaemonErrorMessage(value.runId) : undefined,
    projectId: value.projectId ? sanitizeDaemonErrorMessage(value.projectId) : undefined,
    title: value.title ? sanitizeDaemonErrorMessage(value.title) : undefined,
    eventId: value.eventId ? sanitizeDaemonErrorMessage(value.eventId) : undefined,
    error: value.error ? sanitizeDaemonErrorMessage(value.error) : undefined,
    events: value.events?.map(sanitizeDaemonRunEvent)
  };
  return job;
}

function sanitizeDaemonRunEvent(value: DaemonRunEvent): DaemonRunEvent {
  return {
    ...value,
    id: sanitizeDaemonErrorMessage(value.id),
    type: sanitizeDaemonErrorMessage(value.type),
    summary: sanitizeDaemonErrorMessage(value.summary),
    stream: value.stream ? sanitizeDaemonErrorMessage(value.stream) : undefined
  };
}

function isDaemonJob(value: unknown): value is DaemonJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<DaemonJob>;
  return typeof job.id === "string"
    && (job.runId === undefined || typeof job.runId === "string")
    && (job.projectId === undefined || typeof job.projectId === "string")
    && (job.title === undefined || typeof job.title === "string")
    && typeof job.command === "string"
    && Array.isArray(job.args)
    && typeof job.status === "string"
    && typeof job.ok === "boolean"
    && (job.exitCode === undefined || typeof job.exitCode === "number" || job.exitCode === null)
    && (job.outputTruncated === undefined || typeof job.outputTruncated === "boolean")
    && typeof job.createdAt === "string"
    && (job.startedAt === undefined || typeof job.startedAt === "string")
    && (job.completedAt === undefined || typeof job.completedAt === "string")
    && typeof job.updatedAt === "string"
    && typeof job.timeoutMs === "number"
    && (job.eventId === undefined || typeof job.eventId === "string")
    && (job.error === undefined || typeof job.error === "string");
}

function isDaemonRunStateResult(value: unknown): value is DaemonRunStateResult {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<DaemonRunStateResult>;
  return state.ok === true
    && Array.isArray(state.runs)
    && state.runs.every(isRunRecord)
    && Array.isArray(state.jobs)
    && state.jobs.every(isDaemonRunJob);
}

function isDaemonRunJob(value: unknown): value is DaemonRunJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<DaemonRunJob>;
  return typeof job.id === "string"
    && (job.runId === undefined || typeof job.runId === "string")
    && (job.projectId === undefined || typeof job.projectId === "string")
    && (job.title === undefined || typeof job.title === "string")
    && typeof job.command === "string"
    && Array.isArray(job.args)
    && job.args.every((item) => typeof item === "string")
    && isDaemonJobStatus(job.status)
    && typeof job.ok === "boolean"
    && (job.exitCode === undefined || typeof job.exitCode === "number" || job.exitCode === null)
    && (job.signal === undefined || typeof job.signal === "string" || job.signal === null)
    && (job.outputTruncated === undefined || typeof job.outputTruncated === "boolean")
    && typeof job.createdAt === "string"
    && (job.startedAt === undefined || typeof job.startedAt === "string")
    && (job.completedAt === undefined || typeof job.completedAt === "string")
    && typeof job.updatedAt === "string"
    && (job.timeoutMs === undefined || typeof job.timeoutMs === "number")
    && (job.eventId === undefined || typeof job.eventId === "string")
    && (job.error === undefined || typeof job.error === "string")
    && (job.interrupted === undefined || typeof job.interrupted === "boolean")
    && (job.events === undefined || Array.isArray(job.events) && job.events.every(isDaemonRunEvent));
}

function isDaemonRunEvent(value: unknown): value is DaemonRunEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<DaemonRunEvent>;
  return typeof event.id === "string"
    && typeof event.type === "string"
    && typeof event.createdAt === "string"
    && typeof event.summary === "string"
    && (event.stream === undefined || typeof event.stream === "string")
    && (event.truncated === undefined || typeof event.truncated === "boolean")
    && (event.status === undefined || isDaemonJobStatus(event.status))
    && (event.exitCode === undefined || typeof event.exitCode === "number" || event.exitCode === null)
    && (event.signal === undefined || typeof event.signal === "string" || event.signal === null);
}

function isRunRecord(value: unknown): value is RunRecord {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<RunRecord>;
  return typeof run.id === "string"
    && typeof run.projectId === "string"
    && typeof run.title === "string"
    && isRunStatus(run.status)
    && typeof run.summary === "string"
    && (run.command === undefined || typeof run.command === "string")
    && (run.jobId === undefined || typeof run.jobId === "string")
    && typeof run.createdAt === "string"
    && typeof run.updatedAt === "string";
}

function isRunStatus(status: unknown): status is RunRecord["status"] {
  return ["draft", "awaiting_approval", "reviewed", "approved", "dispatched", "running", "completed", "failed", "blocked"].includes(String(status));
}

function isDaemonJobStatus(status: unknown): status is DaemonRunJob["status"] {
  return ["queued", "running", "completed", "failed", "cancelled", "timed_out"].includes(String(status));
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
