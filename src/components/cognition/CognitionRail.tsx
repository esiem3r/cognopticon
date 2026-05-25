import { Activity, History, PanelRightOpen } from "lucide-react";
import type { AgencyTickResult, DaemonStatus } from "../../agency/types";
import type { CognopticonEvent } from "../../intelligence/types";
import type { InterventionProposal } from "../../intelligence/types";
import type { RunRecord } from "../../types/cognopticon";
import { GoalStackPanel } from "./GoalStackPanel";
import { MissionStateBadge } from "./MissionStateBadge";
import { ProposalCard } from "./ProposalCard";
import { isVisibleRuntimeEvent, runtimeEventView } from "./runtimeEventView";

interface CognitionRailProps {
  tick: AgencyTickResult;
  daemonStatus: DaemonStatus;
  orchestratorActive: boolean;
  orchestratorMessage: string;
  runtimeEvents: CognopticonEvent[];
  runs: RunRecord[];
  onFocus: (nodeId: string) => void;
  onMission: (proposal: InterventionProposal) => void;
  onStartOrchestrator: () => void;
  onOpenRunHistory: () => void;
  onOpenRuntimeHealth: () => void;
  onInspectRun: (runId: string) => void;
}

export function CognitionRail({ tick, daemonStatus, orchestratorActive, orchestratorMessage, runtimeEvents, runs, onFocus, onMission, onStartOrchestrator, onOpenRunHistory, onOpenRuntimeHealth, onInspectRun }: CognitionRailProps) {
  const proposals = dedupeVisibleProposals(tick.proposals).slice(0, 5);
  const visibleRuntimeEvents = runtimeEvents.filter(isVisibleRuntimeEvent).slice(0, 4);
  return (
    <aside className="cognition-rail" aria-label="Cognition rail">
      <header>
        <div className="rail-header-row">
          <div>
            <span>Agency Kernel</span>
            <strong>{daemonStatus.online ? "Daemon online" : "Daemon offline"}</strong>
          </div>
          <button type="button" className="icon-button compact" onClick={onOpenRuntimeHealth} aria-label="Open runtime health">
            <Activity size={15} aria-hidden />
          </button>
        </div>
        {!daemonStatus.online && (
          <p>Registered local actions are paused. Mission packets, focus changes, and copy-command fallbacks remain available.</p>
        )}
      </header>
      <section className={orchestratorActive ? "orchestrator-panel active" : "orchestrator-panel"} aria-label="Orchestrator access">
        <h3>Orchestrator</h3>
        <strong>{orchestratorActive ? "Visualizer armed" : "User access only"}</strong>
        <p>{orchestratorMessage}</p>
        <button type="button" onClick={onStartOrchestrator}>
          {orchestratorActive ? "Recenter Visualizer" : "Start Orchestrator"}
        </button>
      </section>
      <section>
        <h3>Proposals</h3>
        {proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} onFocus={onFocus} onMission={onMission} />)}
      </section>
      <section className="runtime-feed" aria-label="Runtime event feed">
        <div className="runtime-heading">
          <h3>Runs</h3>
          <button type="button" className="icon-button compact" onClick={onOpenRunHistory} aria-label="Open run history">
            <History size={15} aria-hidden />
          </button>
        </div>
        {runs.length === 0 && <p>No approved mission or daemon run has been dispatched in this view.</p>}
        {runs.slice(0, 5).map((run) => (
          <article key={run.id} className="runtime-event" data-state={run.status}>
            <span>{run.status}</span>
            <strong>{run.title}</strong>
            <p>{run.summary}</p>
            <button type="button" className="icon-button compact" onClick={() => onInspectRun(run.id)} aria-label={`Inspect ${run.title}`}>
              <PanelRightOpen size={15} aria-hidden />
            </button>
          </article>
        ))}
        <h3>Runtime</h3>
        {visibleRuntimeEvents.length === 0 && <p>No daemon events received in this view.</p>}
        {visibleRuntimeEvents.map((event) => {
          const view = runtimeEventView(event);
          return (
            <article key={event.id} className="runtime-event" data-state={view.state}>
              <span>{view.label}</span>
              <strong>{view.summary}</strong>
              {view.detail && <p>{view.detail}</p>}
              <time dateTime={event.createdAt}>{view.time}</time>
            </article>
          );
        })}
      </section>
      <GoalStackPanel goals={tick.updatedGoals} />
      <section>
        <h3>Missions</h3>
        {tick.missions.slice(0, 3).map((mission) => <MissionStateBadge key={mission.id} mission={mission} />)}
      </section>
    </aside>
  );
}

function dedupeVisibleProposals(proposals: InterventionProposal[]) {
  const seen = new Set<string>();
  return proposals.filter((proposal) => {
    const key = `${proposal.kind}:${proposal.nodeIds.join("+")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
