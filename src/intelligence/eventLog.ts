import type { CognopticonEvent } from "./types";

export function appendEvent(events: CognopticonEvent[], event: CognopticonEvent) {
  return [...events, event].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function event(type: CognopticonEvent["type"], workspaceId: string, payload: unknown, nodeId?: string): CognopticonEvent {
  return { id: `event:${type}:${crypto.randomUUID()}`, type, workspaceId, nodeId, payload, createdAt: new Date().toISOString() };
}
