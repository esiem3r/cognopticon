import { Copy, X } from "lucide-react";
import type { MissionBrief, ProjectDossier } from "../types/cognopticon";

interface MissionDrawerProps {
  brief: MissionBrief | null;
  project: ProjectDossier;
  onClose: () => void;
}

export function MissionDrawer({ brief, project, onClose }: MissionDrawerProps) {
  if (!brief) return null;
  const filename = `${project.id}-${brief.generatedAt.slice(0, 10)}-mission.md`;

  return (
    <div className="drawer-backdrop" role="presentation">
      <aside className="mission-drawer" aria-label={`${project.name} mission brief`}>
        <header>
          <div>
            <p>Mission packet</p>
            <h2>{project.name}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close mission brief">
            <X size={18} aria-hidden />
          </button>
        </header>
        <textarea value={brief.markdown} readOnly aria-label="Generated mission brief" />
        <footer>
          <a
            className="download-button"
            href={`data:text/markdown;charset=utf-8,${encodeURIComponent(brief.markdown)}`}
            download={filename}
          >
            Download Brief
          </a>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(brief.markdown);
            }}
          >
            <Copy size={16} aria-hidden />
            Copy Brief
          </button>
        </footer>
      </aside>
    </div>
  );
}
