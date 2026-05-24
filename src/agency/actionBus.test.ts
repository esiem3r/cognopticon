import { describe, expect, it } from "vitest";
import { defaultAutonomyPolicy } from "../intelligence/policy";
import { invokeAction } from "./actionBus";
import { buildCapabilityRegistry } from "./capabilityRegistry";

describe("action bus", () => {
  it("refuses daemon actions when offline and destructive payloads always", () => {
    const capabilities = buildCapabilityRegistry({ online: false, url: "http://127.0.0.1:8787", checkedAt: "now" });
    const offline = invokeAction({ id: "open", capabilityId: "open_path", nodeIds: [], payload: { path: "/demo/workspace" }, requestedAt: "now", requestedBy: "user" }, capabilities, defaultAutonomyPolicy, "now");
    expect(offline.ok).toBe(false);

    const destructive = invokeAction({ id: "bad", capabilityId: "copy_to_clipboard", nodeIds: [], payload: { command: "rm -rf ." }, requestedAt: "now", requestedBy: "user" }, capabilities, defaultAutonomyPolicy, "now");
    expect(destructive.ok).toBe(false);
    expect(destructive.summary).toMatch(/Destructive/);
  });
});
