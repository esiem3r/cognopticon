import { DossierPanel } from "../components/DossierPanel";
import type { CognopticonWorkspace, ProjectDossier, ProjectRelationship } from "../types/cognopticon";

interface DetailTrayProps {
  open: boolean;
  project: ProjectDossier;
  projects: ProjectDossier[];
  relationships: ProjectRelationship[];
  workspace: CognopticonWorkspace;
  onCreateBrief: (project: ProjectDossier) => void;
  onClose: () => void;
}

export function DetailTray({ open, project, projects, relationships, workspace, onCreateBrief, onClose }: DetailTrayProps) {
  if (!open) return null;
  return (
    <div className="detail-tray">
      <button type="button" className="detail-close" onClick={onClose}>Close</button>
      <DossierPanel project={project} projects={projects} relationships={relationships} workspace={workspace} onCreateBrief={onCreateBrief} />
    </div>
  );
}
