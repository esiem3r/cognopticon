import type { DaemonStatus } from "../agency/types";
import type { CognopticonEvent } from "../intelligence/types";
import type { DaemonActionResult, DaemonJobResult, OrchestratorSessionResult, OrchestratorStateResult, OrchestratorTaskEventResult } from "./daemonClient";

const PUBLIC_DEMO_URL = "public-static-demo";

export async function checkDaemonHealth(baseUrl?: string): Promise<DaemonStatus> {
  return publicDemoStatus(baseUrl);
}

export async function runDaemonCommand(): Promise<DaemonActionResult> {
  return publicActionResult("run-command");
}

export async function createDaemonJob(): Promise<DaemonJobResult> {
  return { ok: false, message: "Local runtime actions are disabled in the public static demo." };
}

export async function getDaemonJob(jobId: string): Promise<DaemonJobResult> {
  return { ok: false, jobId, message: "Local runtime actions are disabled in the public static demo." };
}

export async function openDaemonPath(): Promise<DaemonActionResult> {
  return publicActionResult("open-path");
}

export async function startOrchestratorSession(payload: { focusProjectId: string; visualizerUrl: string }): Promise<OrchestratorSessionResult> {
  return {
    ok: false,
    mode: "orchestrator",
    eventId: crypto.randomUUID(),
    focusProjectId: payload.focusProjectId,
    visualizerUrl: payload.visualizerUrl,
    message: "Local runtime actions are disabled in the public static demo."
  };
}

export async function recordOrchestratorTaskEvent(): Promise<OrchestratorTaskEventResult> {
  return {
    ok: false,
    eventId: crypto.randomUUID(),
    message: "Local runtime actions are disabled in the public static demo."
  };
}

export async function getOrchestratorState(): Promise<OrchestratorStateResult> {
  return {
    ok: false,
    active: false,
    taskEvents: [],
    completedTaskIds: [],
    message: "Local runtime actions are disabled in the public static demo."
  };
}

export function subscribeDaemonEvents() {
  return () => {};
}

export function normalizeDaemonEvent(): CognopticonEvent | null {
  return null;
}

export function isDaemonRequestBoundaryFailure() {
  return false;
}

export function sanitizeDaemonErrorMessage(message: string) {
  if (message.startsWith("Path is outside configured Cognopticon roots")) return "Path is outside configured Cognopticon roots.";
  if (message.startsWith("Command is not allowlisted:")) return "Command is not allowlisted.";
  if (message.startsWith("Command has no daemon safety policy:")) return "Command has no daemon safety policy.";
  if (message.startsWith("npm command is not an approved verification script:")) return "npm command is not an approved verification script.";
  return message.replace(/(^|[\s([{:])(?:[A-Za-z]:)?[\\/][^\s"'`]+/g, "$1[redacted path]");
}

export function daemonToken() {
  return undefined;
}

export function __resetDaemonTokenForTests() {}

export function __setDaemonEventReconnectDelayForTests() {}

function publicDemoStatus(baseUrl?: string): DaemonStatus {
  return {
    online: false,
    url: baseUrl ?? PUBLIC_DEMO_URL,
    checkedAt: new Date().toISOString(),
    error: "disabled in public static demo"
  };
}

function publicActionResult(actionId: string): DaemonActionResult {
  return {
    ok: false,
    actionId,
    eventId: crypto.randomUUID(),
    message: "Local runtime actions are disabled in the public static demo."
  };
}
