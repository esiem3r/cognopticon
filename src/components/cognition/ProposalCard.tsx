import type { InterventionProposal } from "../../intelligence/types";

interface ProposalCardProps {
  proposal: InterventionProposal;
  onFocus: (nodeId: string) => void;
  onMission: (proposal: InterventionProposal) => void;
}

export function ProposalCard({ proposal, onFocus, onMission }: ProposalCardProps) {
  return (
    <article className="proposal-card">
      <span>{proposal.kind.replace(/_/g, " ")} / impact {proposal.impact} / urgency {proposal.urgency}</span>
      <strong>{proposal.title}</strong>
      <p>{proposal.summary}</p>
      <div>
        <button type="button" onClick={() => proposal.nodeIds[0] && onFocus(proposal.nodeIds[0])}>Focus</button>
        <button type="button" onClick={() => onMission(proposal)}>Mission</button>
      </div>
    </article>
  );
}
