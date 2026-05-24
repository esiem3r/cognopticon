import type { Belief, InterventionProposal } from "../intelligence/types";
import type { CognopticonNode } from "../model/cognopticonNode";
import type { DaemonStatus } from "../agency/types";
import { ActionWheel } from "./ActionWheel";
import { FacetPanel } from "./FacetPanel";
import { LaunchPort } from "./LaunchPort";

interface NodeCockpitProps {
  node: CognopticonNode;
  beliefs: Belief[];
  proposals: InterventionProposal[];
  daemonStatus: DaemonStatus;
  launchRunStatus?: string;
  onCreateMission: () => void;
  onRunLaunch: () => void;
  onOpenDetail: () => void;
}

export function NodeCockpit({ node, beliefs, proposals, daemonStatus, launchRunStatus, onCreateMission, onRunLaunch, onOpenDetail }: NodeCockpitProps) {
  const nodeBeliefs = beliefs.filter((belief) => belief.subjectId === node.id && belief.value === true);
  const nodeProposals = proposals.filter((proposal) => proposal.nodeIds.includes(node.id));
  const topProposal = nodeProposals[0];
  return (
    <aside className="node-cockpit" aria-label={`${node.name} node cockpit`}>
      <header>
        <span>{node.kind} / {node.state.decision}</span>
        <h2>{node.name}</h2>
        <div className="cockpit-header-actions">
          <button type="button" onClick={onCreateMission}>Generate Mission</button>
          <button type="button" onClick={onOpenDetail}>Detail</button>
        </div>
      </header>
      {topProposal && (
        <section className="cockpit-priority">
          <span>Best next move</span>
          <strong>{topProposal.title}</strong>
          <p>{topProposal.summary}</p>
        </section>
      )}
      <div className="state-strip">
        <Metric label="readiness" value={node.state.readiness} />
        <Metric label="anomaly" value={Math.round(node.visual.anomalyIntensity * 100)} />
        <Metric label="links" value={node.relationships.length} />
      </div>
      <LaunchPort node={node} daemonStatus={daemonStatus} runStatus={launchRunStatus} onMission={onCreateMission} onRun={onRunLaunch} />
      <FacetPanel facets={node.facets} />
      <section className="belief-strip">
        <h3>Beliefs</h3>
        {nodeBeliefs.slice(0, 4).map((belief) => <span key={belief.id}>{belief.predicate.replace(/_/g, " ")}</span>)}
        {!nodeBeliefs.length && <p>No high-confidence beliefs yet.</p>}
      </section>
      <section className="proposal-strip">
        <h3>Proposals</h3>
        {nodeProposals.slice(0, 3).map((proposal) => <p key={proposal.id}>{proposal.title}</p>)}
        {!nodeProposals.length && <p>No proposal targets this node yet.</p>}
      </section>
      <ActionWheel node={node} onMission={onCreateMission} />
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
