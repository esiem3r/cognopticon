import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import type { DaemonHealthJobStatus, DaemonStatus } from "../agency/types";

interface RuntimeHealthDrawerProps {
  open: boolean;
  daemonStatus: DaemonStatus;
  onClose: () => void;
}

const jobStatuses: DaemonHealthJobStatus[] = ["queued", "running", "completed", "failed", "cancelled", "timed_out"];

export function RuntimeHealthDrawer({ open, daemonStatus, onClose }: RuntimeHealthDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const statusLabel = runtimeStatusLabel(daemonStatus);
  const runtimeMode = runtimeModeLabel(daemonStatus.runtimeMode, daemonStatus.online);
  const activeJobs = (daemonStatus.jobs?.queued ?? 0) + (daemonStatus.jobs?.running ?? 0);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const previousOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousDrawerState = document.body.dataset.cognopticonDrawerOpen;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.dataset.cognopticonDrawerOpen = "runtime-health";
    closeButtonRef.current?.focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
      if (previousDrawerState === undefined) {
        delete document.body.dataset.cognopticonDrawerOpen;
      } else {
        document.body.dataset.cognopticonDrawerOpen = previousDrawerState;
      }
      if (previousActiveElement?.isConnected) previousActiveElement.focus({ preventScroll: true });
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="runtime-health-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <div>
            <p>{statusLabel}</p>
            <h2 id={titleId}>Local runtime health</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={onClose} aria-label="Close runtime health">
            <X size={18} aria-hidden />
          </button>
        </header>

        <section className="drawer-summary-strip" aria-label="Runtime health summary">
          <SummaryMetric label="Mode" value={runtimeMode} />
          <SummaryMetric label="Active jobs" value={activeJobs} />
          <SummaryMetric label="Completed" value={daemonStatus.jobs?.completed ?? 0} />
          <SummaryMetric label="Task events" value={daemonStatus.orchestrator?.taskEvents ?? 0} />
        </section>

        <div className="runtime-health-body">
          <section className="runtime-health-status" data-state={daemonStatus.online ? "online" : "offline"} aria-label="Daemon connection state">
            <span>{runtimeMode}</span>
            <strong>{daemonStatus.url}</strong>
            <time dateTime={daemonStatus.checkedAt} title={daemonStatus.checkedAt}>{formatTimestamp(daemonStatus.checkedAt)}</time>
            {daemonStatus.error && <p>{daemonStatus.error}</p>}
          </section>

          <section className="runtime-health-section" aria-label="Runtime profile">
            <h3>Profile</h3>
            <dl className="runtime-health-grid">
              <RuntimeField label="Profile id" value={daemonStatus.profile?.id} fallback="Unavailable" />
              <RuntimeField label="Label" value={displayProfileValue(daemonStatus.profile?.label)} fallback="Unavailable" />
              <RuntimeField label="Device" value={daemonStatus.profile?.deviceId} fallback="Unavailable" />
              <RuntimeField label="Allowed root count" value={formatCount(daemonStatus.allowedRootCount)} fallback="Unavailable" />
            </dl>
          </section>

          <section className="runtime-health-section" aria-label="Daemon job counts">
            <h3>Jobs</h3>
            <div className="runtime-health-metrics">
              {jobStatuses.map((status) => (
                <div key={status}>
                  <span>{status.replace("_", " ")}</span>
                  <strong>{daemonStatus.jobs?.[status] ?? 0}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="runtime-health-section" aria-label="Orchestrator state">
            <h3>Orchestrator</h3>
            <dl className="runtime-health-grid">
              <RuntimeField label="Sessions" value={formatCount(daemonStatus.orchestrator?.sessions)} fallback="0" />
              <RuntimeField label="Task events" value={formatCount(daemonStatus.orchestrator?.taskEvents)} fallback="0" />
              <RuntimeField label="Latest session" value={daemonStatus.orchestrator?.latestSessionId} fallback="None" />
            </dl>
          </section>
        </div>
      </aside>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RuntimeField({ label, value, fallback }: { label: string; value?: string; fallback: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? fallback}</dd>
    </div>
  );
}

function runtimeStatusLabel(status: DaemonStatus) {
  if (status.runtimeMode === "public_demo") return "Public demo runtime";
  return status.online ? "Local daemon online" : "Local daemon offline";
}

function runtimeModeLabel(mode: DaemonStatus["runtimeMode"], online: boolean) {
  if (mode === "public_demo") return "public demo";
  if (mode === "local_daemon" || online) return "local daemon";
  return "offline";
}

function formatCount(value: number | undefined) {
  return value === undefined ? undefined : String(value);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function displayProfileValue(value: string | undefined) {
  if (!value) return undefined;
  const cleaned = value.replace(/\s*\[redacted path\]\s*/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Sanitized local profile";
}
