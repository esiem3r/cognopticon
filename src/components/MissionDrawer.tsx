import { useEffect, useState } from "react";
import { Copy, X } from "lucide-react";
import type { MissionBrief, ProjectDossier } from "../types/cognopticon";

interface MissionDrawerProps {
  brief: MissionBrief | null;
  project: ProjectDossier;
  dispatchStatus?: string;
  dispatchSummary?: string;
  onMarkReviewed: () => void;
  onClose: () => void;
}

export function MissionDrawer({ brief, project, dispatchStatus = "draft", dispatchSummary, onMarkReviewed, onClose }: MissionDrawerProps) {
  const [downloadUrl, setDownloadUrl] = useState<string | undefined>();

  useEffect(() => {
    if (!brief || typeof URL === "undefined") {
      setDownloadUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(new Blob([brief.markdown], { type: "text/markdown;charset=utf-8" }));
    setDownloadUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [brief]);

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
        <section className="mission-approval" aria-label="Mission approval state">
          <span>{dispatchStatus}</span>
          <strong>{dispatchSummary ?? "Review records intent only. Use Run or Run Verification for daemon-backed execution."}</strong>
        </section>
        <footer>
          <a
            className="download-button"
            href={downloadUrl}
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
          <button type="button" className="dispatch-button" onClick={onMarkReviewed}>
            Mark Reviewed
          </button>
        </footer>
      </aside>
    </div>
  );
}
