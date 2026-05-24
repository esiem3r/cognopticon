import type { CompiledMission } from "../../intelligence/types";

export function MissionStateBadge({ mission }: { mission: CompiledMission }) {
  return <span className="mission-state-badge">compiled / {mission.title}</span>;
}
