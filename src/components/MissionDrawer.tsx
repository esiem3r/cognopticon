import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Copy, Download, X } from "lucide-react";
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { status: copyStatus, announce: announceCopyStatus, reset: resetCopyStatus } = useAnnouncementStatus();
  const packetResult = useMemo(() => brief ? parseMissionPacketMarkdown(brief.markdown) : undefined, [brief]);
  const packet = packetResult?.ok ? packetResult.packet : undefined;
  const workerPrompt = useMemo(() => {
    if (!brief || !packetResult?.ok) return undefined;
    return prepareManualAgentHandoffPrompt(brief.markdown);
  }, [brief, packetResult]);
  const delivery = useMemo(
    () => missionDrawerDeliveryState(brief, packetResult, dispatchStatus, dispatchSummary),
    [brief, dispatchStatus, dispatchSummary, packetResult]
  );
  const titleId = useMemo(() => `mission-drawer-title-${project.id.replace(/[^A-Za-z0-9_-]/g, "-")}`, [project.id]);

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

  useEffect(() => {
    if (!brief) return;
    if (typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousDrawerState = document.body.dataset.cognopticonDrawerOpen;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.dataset.cognopticonDrawerOpen = "mission";
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
      if (previousDrawerState === undefined) {
        delete document.body.dataset.cognopticonDrawerOpen;
      } else {
        document.body.dataset.cognopticonDrawerOpen = previousDrawerState;
      }
    };
  }, [brief]);

  useEffect(() => {
    if (!brief) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [brief, onClose]);

  if (!brief) return null;
  const filename = `${project.id}-${brief.generatedAt.slice(0, 10)}-mission.md`;
  const markdownTitle = brief.markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const reviewTitle = packet?.title ?? markdownTitle ?? `${project.name} mission brief`;
  const reviewObjective = packet?.objective ?? brief.markdown.replace(/^#\s+.+$/m, "").trim();

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
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="mission-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <div>
            <p>Mission packet</p>
            <h2 id={titleId}>{project.name}</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={onClose} aria-label="Close mission brief">
            <X size={18} aria-hidden />
          </button>
        </header>
        <section className="mission-review" aria-label="Generated mission brief">
          <div className="mission-review-hero">
            <p>{packet ? "Validated mission" : "Packet requires attention"}</p>
            <h3>{reviewTitle}</h3>
            <p>{reviewObjective}</p>
            <dl className="mission-facts">
              <div>
                <dt>Generated</dt>
                <dd>{new Date(brief.generatedAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{packet?.source ?? "unverified"}</dd>
              </div>
              <div>
                <dt>Projects</dt>
                <dd>{packet?.projectIds.join(", ") ?? project.id}</dd>
              </div>
              <div>
                <dt>Packet</dt>
                <dd>{delivery.packetReady ? "ready" : "blocked"}</dd>
              </div>
            </dl>
          </div>

          {packet ? (
            <>
              <MissionSection title="Context">
                <p>{packet.context.summary}</p>
                <p className="mission-muted">{packet.context.currentState}</p>
              </MissionSection>

              <MissionSection title="Acceptance Criteria">
                <MissionList items={packet.acceptanceCriteria} />
              </MissionSection>

              <MissionSection title="Verification Commands">
                <MissionList items={packet.verificationCommands} code />
              </MissionSection>

              <MissionSection title="Authority Boundary">
                <div className="mission-authority-grid">
                  <AuthorityGroup label="Read" items={packet.authority.mayRead} />
                  <AuthorityGroup label="Edit" items={packet.authority.mayEdit} fallback="No edit authority granted." />
                  <AuthorityGroup label="Run" items={packet.authority.mayRun} fallback="No commands granted." />
                  <AuthorityGroup label="Approval" items={packet.authority.requiresApproval} />
                </div>
              </MissionSection>

              <MissionSection title="Constraints And Risks">
                <MissionList items={[...packet.constraints, ...packet.context.knownRisks]} fallback="No additional constraints or risks recorded." />
              </MissionSection>
            </>
          ) : (
            <MissionSection title="Packet Problems">
              <MissionList items={packetResult?.ok === false ? packetResult.errors : ["Mission packet could not be parsed."]} />
            </MissionSection>
          )}

          <details className="mission-source" open={!delivery.packetReady}>
            <summary>Packet source</summary>
            <pre>{brief.markdown}</pre>
          </details>
        </section>
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
            <Download size={16} aria-hidden />
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
            <CheckCircle2 size={16} aria-hidden />
            Mark Reviewed
          </button>
        </footer>
      </aside>
    </div>
  );
}

function MissionSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mission-review-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function MissionList({ items, fallback = "None recorded.", code = false }: { items: string[]; fallback?: string; code?: boolean }) {
  const visibleItems = items.length ? items : [fallback];
  return (
    <ul className="mission-review-list">
      {visibleItems.map((item) => (
        <li key={item}>{code ? <code>{item}</code> : item}</li>
      ))}
    </ul>
  );
}

function AuthorityGroup({ label, items, fallback = "None recorded." }: { label: string; items: string[]; fallback?: string }) {
  return (
    <div>
      <span>{label}</span>
      <MissionList items={items} fallback={fallback} code={label === "Run"} />
    </div>
  );
}
