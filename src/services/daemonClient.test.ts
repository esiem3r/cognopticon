import { describe, expect, it } from "vitest";
import { isDaemonRequestBoundaryFailure, normalizeDaemonEvent, sanitizeDaemonErrorMessage } from "./daemonClient";

describe("daemon event normalization", () => {
  it("drops request-boundary failures from the operator runtime stream", () => {
    expect(isDaemonRequestBoundaryFailure({ error: "Origin is not allowed: http://127.0.0.1:5176" })).toBe(true);
    expect(isDaemonRequestBoundaryFailure({ error: "Cognopticon daemon token is required for this origin" })).toBe(true);

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
});
