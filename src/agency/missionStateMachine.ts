import type { MissionState, MissionStatus } from "./types";

const allowed: Record<MissionStatus, MissionStatus[]> = {
  proposed: ["compiled", "rejected", "stale"],
  compiled: ["awaiting_approval", "approved", "superseded"],
  awaiting_approval: ["approved", "rejected"],
  approved: ["dispatched", "rejected"],
  dispatched: ["running", "failed"],
  running: ["completed", "failed", "stale"],
  completed: ["superseded"],
  failed: ["compiled", "superseded"],
  stale: ["compiled", "superseded"],
  superseded: [],
  rejected: []
};

export function transitionMission(state: MissionState, status: MissionStatus, timestamp = new Date().toISOString()): MissionState {
  if (!allowed[state.status].includes(status)) return state;
  return { ...state, status, updatedAt: timestamp, dispatchedAt: status === "dispatched" ? timestamp : state.dispatchedAt, completedAt: status === "completed" ? timestamp : state.completedAt };
}
