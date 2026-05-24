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

const DEFAULT_DAEMON_URL = "http://127.0.0.1:8787";

export async function checkDaemonHealth(baseUrl = DEFAULT_DAEMON_URL): Promise<DaemonStatus> {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("daemon") === "off") {
    return { online: false, url: baseUrl, checkedAt: new Date().toISOString(), error: "disabled by URL" };
  }
  try {
    const response = await fetch(withDaemonToken(`${baseUrl}/api/health`), { method: "GET", headers: daemonAuthHeaders() });
    if (!response.ok) return { online: false, url: baseUrl, checkedAt: new Date().toISOString(), error: `HTTP ${response.status}` };
    return { online: true, url: baseUrl, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { online: false, url: baseUrl, checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "Unknown daemon error" };
  }
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
    const response = await fetch(withDaemonToken(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`), { headers: daemonAuthHeaders() });
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

export function subscribeDaemonEvents(onEvent: (event: CognopticonEvent) => void, baseUrl = DEFAULT_DAEMON_URL) {
  const source = new EventSource(withDaemonToken(`${baseUrl}/api/events`));
  source.addEventListener("snapshot", (message) => {
    try {
      const lines = JSON.parse(message.data) as string[];
      for (const line of lines) {
        const event = normalizeDaemonEvent(JSON.parse(line));
        if (event) onEvent(event);
      }
    } catch {
      // Ignore malformed historical daemon output.
    }
  });
  for (const type of daemonEventTypes) {
    source.addEventListener(type, (message) => {
      try {
        const event = normalizeDaemonEvent(JSON.parse((message as MessageEvent).data));
        if (event) onEvent(event);
      } catch {
        // Ignore malformed live daemon output.
      }
    });
  }
  source.onerror = () => {
    source.close();
  };
  return () => source.close();
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
  return message.startsWith("Origin is not allowed:") || message === "Cognopticon daemon token is required for this origin";
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

function withDaemonToken(url: string) {
  const token = daemonToken();
  if (!token) return url;
  const nextUrl = new URL(url);
  nextUrl.searchParams.set("daemonToken", token);
  return nextUrl.toString();
}

function daemonToken() {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const token = params.get("daemonToken");
  if (token) {
    window.localStorage.setItem("cognopticon:daemonToken", token);
    return token;
  }
  return window.localStorage.getItem("cognopticon:daemonToken") ?? undefined;
}
