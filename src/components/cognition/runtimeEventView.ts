import type { CognopticonEvent } from "../../intelligence/types";
import { sanitizeDaemonErrorMessage } from "../../services/daemonClient";

export interface RuntimeEventView {
  label: string;
  summary: string;
  detail?: string;
  state: "running" | "completed" | "failed" | "blocked" | "idle";
  time: string;
}

type RuntimePayload = {
  action?: string;
  args?: string[];
  category?: string;
  command?: string;
  endpoint?: string;
  error?: string;
  focusProjectId?: string;
  id?: string;
  jobId?: string;
  label?: string;
  message?: string;
  method?: string;
  projectId?: string;
  requestId?: string;
  sessionId?: string;
  status?: string;
  taskId?: string;
};

export function isVisibleRuntimeEvent(event: CognopticonEvent) {
  const payload = event.payload as RuntimePayload | undefined;
  return !(event.type === "action_failed" && isRequestBoundaryFailure(payload?.error));
}

export function runtimeEventView(event: CognopticonEvent): RuntimeEventView {
  const payload = event.payload as RuntimePayload | undefined;
  const time = new Date(event.createdAt).toLocaleTimeString();
  if (event.type === "action_failed") {
    const action = payload?.action ? humanize(payload.action) : "daemon action";
    return {
      label: payload?.category === "policy_block" ? "Policy blocked" : `${action} failed`,
      summary: payload?.error ? sanitizeDaemonErrorMessage(payload.error) : "Daemon action failed without a structured error.",
      detail: requestDetail(payload),
      state: payload?.category === "policy_block" ? "blocked" : "failed",
      time
    };
  }

  if (event.type === "orchestrator_session_started") {
    return {
      label: "Orchestrator session",
      summary: payload?.message ?? "Visualizer armed by daemon.",
      detail: payload?.focusProjectId ? `Focus ${payload.focusProjectId}` : payload?.sessionId,
      state: "completed",
      time
    };
  }

  if (event.type === "orchestrator_task_completed" || event.type === "orchestrator_task_reopened") {
    return {
      label: event.type === "orchestrator_task_completed" ? "Task completed" : "Task reopened",
      summary: payload?.label ?? payload?.taskId ?? "Orchestrator task event recorded.",
      detail: payload?.projectId,
      state: event.type === "orchestrator_task_completed" ? "completed" : "running",
      time
    };
  }

  if (event.type.startsWith("job_")) {
    return {
      label: humanize(event.type),
      summary: jobSummary(payload),
      detail: payload?.id ?? payload?.jobId,
      state: jobEventState(event.type, payload?.status),
      time
    };
  }

  return {
    label: humanize(event.type),
    summary: payload?.message ?? payload?.taskId ?? payload?.command ?? payload?.status ?? payload?.projectId ?? "Daemon event recorded.",
    detail: requestDetail(payload),
    state: "idle",
    time
  };
}

function jobSummary(payload: RuntimePayload | undefined) {
  const command = [payload?.command, ...(payload?.args ?? [])].filter(Boolean).join(" ");
  if (command && payload?.status) return `${command} / ${payload.status}`;
  return command || payload?.status || payload?.message || "Daemon job event recorded.";
}

function jobEventState(type: string, status: string | undefined): RuntimeEventView["state"] {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "timed_out" || status === "cancelled") return "failed";
  if (type === "job_finished") return "completed";
  return "running";
}

function requestDetail(payload: RuntimePayload | undefined) {
  const request = [payload?.method, payload?.endpoint].filter(Boolean).join(" ");
  return [request, payload?.requestId].filter(Boolean).join(" / ") || undefined;
}

function isRequestBoundaryFailure(error: string | undefined) {
  if (__COGNOPTICON_PUBLIC_DEMO__) return false;
  return Boolean(error && (
    error.startsWith("Origin is not allowed:")
    || error === "Cognopticon daemon token is required for this origin"
    || error === "Cognopticon daemon token must be sent in X-Cognopticon-Token header"
  ));
}

function humanize(value: string) {
  return value.replace(/_/g, " ");
}
