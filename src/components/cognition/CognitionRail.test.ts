import { describe, expect, it } from "vitest";
import type { CognopticonEvent } from "../../intelligence/types";
import { isVisibleRuntimeEvent, runtimeEventView } from "./runtimeEventView";

describe("runtime event presentation", () => {
  it("keeps request-boundary auth noise out of the visible rail", () => {
    const event = runtimeEvent({
      type: "action_failed",
      payload: { error: "Origin is not allowed: http://127.0.0.1:5176" }
    });

    expect(isVisibleRuntimeEvent(event)).toBe(false);
  });

  it("renders actionable daemon failures with category and request provenance", () => {
    const event = runtimeEvent({
      type: "action_failed",
      payload: {
        error: "Destructive commands are not supported",
        category: "policy_block",
        action: "daemon_job",
        endpoint: "/api/jobs",
        method: "POST",
        requestId: "request:42"
      }
    });

    expect(isVisibleRuntimeEvent(event)).toBe(true);
    expect(runtimeEventView(event)).toMatchObject({
      label: "Policy blocked",
      summary: "Destructive commands are not supported",
      detail: "POST /api/jobs / request:42",
      state: "blocked"
    });
  });

  it("redacts path-bearing failure summaries before display", () => {
    const event = runtimeEvent({
      type: "action_failed",
      payload: {
        error: "Path is outside configured Cognopticon roots: /home/user/private/project",
        category: "policy_block",
        action: "daemon_job",
        endpoint: "/api/jobs",
        method: "POST",
        requestId: "request:path"
      }
    });

    const view = runtimeEventView(event);
    expect(view.summary).toBe("Path is outside configured Cognopticon roots.");
    expect(JSON.stringify(view)).not.toContain("/home/user/private/project");
  });

  it("renders repeated failures with distinct request ids", () => {
    const first = runtimeEvent({
      id: "daemon:first",
      type: "action_failed",
      payload: { error: "Unknown orchestrator session: old", category: "orchestrator_session", action: "orchestrator_task_event", endpoint: "/api/orchestrator/task-event", method: "POST", requestId: "request:1" }
    });
    const second = runtimeEvent({
      id: "daemon:second",
      type: "action_failed",
      payload: { error: "Unknown orchestrator session: old", category: "orchestrator_session", action: "orchestrator_task_event", endpoint: "/api/orchestrator/task-event", method: "POST", requestId: "request:2" }
    });

    expect(runtimeEventView(first).detail).toBe("POST /api/orchestrator/task-event / request:1");
    expect(runtimeEventView(second).detail).toBe("POST /api/orchestrator/task-event / request:2");
  });
});

function runtimeEvent({
  id = "daemon:event",
  type,
  payload
}: {
  id?: string;
  type: CognopticonEvent["type"];
  payload: unknown;
}): CognopticonEvent {
  return {
    id,
    type,
    workspaceId: "local",
    payload,
    createdAt: "2026-05-23T12:00:00.000Z"
  };
}
