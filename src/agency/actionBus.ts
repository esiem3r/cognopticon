import type { CognopticonEvent } from "../intelligence/types";
import type { ActionInvocation, ActionOutcome, AutonomyPolicy, Capability } from "./types";

export function invokeAction(invocation: ActionInvocation, capabilities: Capability[], policy: AutonomyPolicy, timestamp = new Date().toISOString()): ActionOutcome {
  const capability = capabilities.find((item) => item.id === invocation.capabilityId);
  const events: CognopticonEvent[] = [];
  if (!capability) return outcome(invocation, false, "Capability is not registered.", events, timestamp);
  if (!capability.available) return outcome(invocation, false, `${capability.label} is unavailable. Use copy or mission fallback.`, events, timestamp);
  if (capability.requiresDaemon && policy.autonomyLevel !== "execute_registered_actions") {
    return outcome(invocation, false, `${capability.label} requires execute_registered_actions authority.`, events, timestamp);
  }
  if (isDestructivePayload(invocation.payload)) return outcome(invocation, false, "Destructive actions are not supported.", events, timestamp);
  events.push({ id: `event:action:${invocation.id}`, type: "command_executed", workspaceId: "local", payload: invocation, createdAt: timestamp });
  return outcome(invocation, true, `${capability.label} accepted by action bus.`, events, timestamp);
}

function outcome(invocation: ActionInvocation, ok: boolean, summary: string, events: CognopticonEvent[], timestamp: string): ActionOutcome {
  return { id: `outcome:${invocation.id}`, invocationId: invocation.id, ok, summary, evidence: [{ kind: "event", label: summary, confidence: ok ? 0.9 : 0.72 }], events, completedAt: timestamp };
}

function isDestructivePayload(payload: unknown) {
  return /delete|rm -rf|reset --hard|git push|git commit|format disk/i.test(JSON.stringify(payload));
}
