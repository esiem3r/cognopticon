import { useEffect, useMemo, useState } from "react";
import { Copy, X } from "lucide-react";
import type { MissionBrief, ProjectDossier } from "../types/cognopticon";
import { parseMissionPacketMarkdown } from "../lib/missionPacket";
import { missionDrawerDeliveryState } from "./missionDrawerState";

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
  const packetResult = useMemo(() => brief ? parseMissionPacketMarkdown(brief.markdown) : undefined, [brief]);
  const delivery = useMemo(
    () => missionDrawerDeliveryState(brief, packetResult, dispatchStatus, dispatchSummary),
    [brief, dispatchStatus, dispatchSummary, packetResult]
  );

  useEffect(() => {
    if (!delivery.markdownForDelivery || typeof URL === "undefined") {
      setDownloadUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(new Blob([delivery.markdownForDelivery], { type: "text/markdown;charset=utf-8" }));
    setDownloadUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [delivery.markdownForDelivery]);

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
          <span>{delivery.status}</span>
          <strong>{delivery.summary}</strong>
        </section>
        <footer>
          <a
            className="download-button"
            href={downloadUrl}
            download={filename}
            aria-disabled={!delivery.packetReady}
          >
            Download Brief
          </a>
          <button
            type="button"
            disabled={!delivery.packetReady}
            onClick={() => {
              if (delivery.markdownForDelivery) void navigator.clipboard?.writeText(delivery.markdownForDelivery);
            }}
          >
            <Copy size={16} aria-hidden />
            Copy Brief
          </button>
          <button type="button" className="dispatch-button" onClick={onMarkReviewed} disabled={!delivery.packetReady}>
            Mark Reviewed
          </button>
        </footer>
      </aside>
    </div>
  );
}
