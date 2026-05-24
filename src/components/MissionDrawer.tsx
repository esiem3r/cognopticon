import { useEffect, useMemo, useState } from "react";
import { Copy, X } from "lucide-react";
import type { MissionBrief, ProjectDossier } from "../types/cognopticon";
import { parseMissionPacketMarkdown } from "../lib/missionPacket";
import { missionDrawerDeliveryState } from "./missionDrawerState";
import { prepareManualAgentHandoffPrompt } from "../agency/agentAdapters";

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
  const [copyState, setCopyState] = useState<{ target: "brief" | "worker"; message: string } | null>(null);
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
    setCopyState(null);
  }, [brief?.markdown]);

  if (!brief) return null;
  const filename = `${project.id}-${brief.generatedAt.slice(0, 10)}-mission.md`;

  async function copyPayload(target: "brief" | "worker", text: string | undefined) {
    if (!text) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setCopyState({ target, message: target === "worker" ? "Worker prompt copied." : "Mission brief copied." });
    } catch {
      setCopyState({ target, message: target === "worker" ? "Clipboard write failed. Worker prompt was not copied." : "Clipboard write failed. Download remains available." });
    }
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
        <output className="mission-copy-feedback" aria-live="polite">
          {copyState?.message ?? ""}
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
            data-copy-state={copyState?.target === "brief" ? "active" : "idle"}
          >
            <Copy size={16} aria-hidden />
            Copy Brief
          </button>
          <button
            type="button"
            disabled={!workerPrompt}
            onClick={() => void copyPayload("worker", workerPrompt)}
            data-copy-state={copyState?.target === "worker" ? "active" : "idle"}
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
