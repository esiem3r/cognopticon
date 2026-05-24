import { useEffect, useMemo, useState } from "react";
import { Copy, X } from "lucide-react";
import { prepareManualAgentHandoffPrompt } from "../agency/agentAdapters";
import { useAnnouncementStatus } from "../hooks/useAnnouncementStatus";
import { parseMissionPacketMarkdown } from "../lib/missionPacket";
import type { MissionBrief, ProjectDossier } from "../types/cognopticon";
import { missionDrawerDeliveryState } from "./missionDrawerState";

interface MissionDrawerProps {
  brief: MissionBrief | null;
  project: ProjectDossier;
  dispatchStatus?: string;
  dispatchSummary?: string;
  onMarkReviewed: () => void;
  onClose: () => void;
}

type CopyTarget = "brief" | "worker";

export function MissionDrawer({ brief, project, dispatchStatus = "draft", dispatchSummary, onMarkReviewed, onClose }: MissionDrawerProps) {
  const [downloadUrl, setDownloadUrl] = useState<string | undefined>();
  const [copyTarget, setCopyTarget] = useState<CopyTarget | null>(null);
  const { status: copyStatus, announce: announceCopyStatus, reset: resetCopyStatus } = useAnnouncementStatus();
  const packetResult = useMemo(() => brief ? parseMissionPacketMarkdown(brief.markdown) : undefined, [brief]);
  const workerPrompt = useMemo(() => {
    if (!brief || !packetResult?.ok) return undefined;
    return prepareManualAgentHandoffPrompt(brief.markdown);
  }, [brief, packetResult]);
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

  useEffect(() => {
    setCopyTarget(null);
    resetCopyStatus();
  }, [brief?.markdown, resetCopyStatus]);

  if (!brief) return null;
  const filename = `${project.id}-${brief.generatedAt.slice(0, 10)}-mission.md`;

  async function copyPayload(target: CopyTarget, text: string | undefined) {
    if (!text) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      updateCopyStatus(target, target === "worker" ? "Worker prompt copied." : "Mission brief copied.");
    } catch {
      updateCopyStatus(target, target === "worker" ? "Clipboard write failed. Worker prompt was not copied." : "Clipboard write failed. Download remains available.");
    }
  }
  function updateCopyStatus(target: CopyTarget, message: string) {
    setCopyTarget(target);
    announceCopyStatus(message);
  }

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
          {workerPrompt && <p>Manual handoff ready. No agent or daemon dispatch will run from this drawer.</p>}
        </section>
        <output className="mission-copy-feedback" role="status" aria-atomic="true">
          {copyStatus.message}
          {copyStatus.nonce > 0 && <span className="sr-only"> Attempt {copyStatus.nonce}.</span>}
        </output>
        <footer>
          <a
            className="download-button"
            href={downloadUrl}
            download={filename}
            aria-disabled={!delivery.packetReady}
            tabIndex={delivery.packetReady ? undefined : -1}
          >
            Download Brief
          </a>
          <button
            type="button"
            disabled={!delivery.packetReady}
            onClick={() => void copyPayload("brief", delivery.markdownForDelivery)}
            data-copy-state={copyTarget === "brief" ? "active" : "idle"}
          >
            <Copy size={16} aria-hidden />
            Copy Brief
          </button>
          <button
            type="button"
            disabled={!workerPrompt}
            onClick={() => void copyPayload("worker", workerPrompt)}
            data-copy-state={copyTarget === "worker" ? "active" : "idle"}
          >
            <Copy size={16} aria-hidden />
            Copy Worker Prompt
          </button>
          <button type="button" className="dispatch-button" onClick={onMarkReviewed} disabled={!delivery.packetReady}>
            Mark Reviewed
          </button>
        </footer>
      </aside>
    </div>
  );
}
