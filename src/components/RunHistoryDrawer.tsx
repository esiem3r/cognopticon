import { useEffect, useId, useMemo, useRef } from "react";
import { X } from "lucide-react";
import type { DaemonRunJob } from "../services/daemonClient";
import type { RunRecord } from "../types/cognopticon";

interface RunHistoryDrawerProps {
  open: boolean;
  runs: RunRecord[];
  jobs?: DaemonRunJob[];
  selectedRunId?: string;
  onSelectRun: (runId: string) => void;
  onClose: () => void;
}

export function RunHistoryDrawer({ open, runs, jobs = [], selectedRunId, onSelectRun, onClose }: RunHistoryDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const orderedRuns = useMemo(() => [...runs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [runs]);
  const selectedRun = orderedRuns.find((run) => run.id === selectedRunId) ?? orderedRuns[0];
  const selectedJob = selectedRun ? jobs.find((job) => job.id === selectedRun.jobId || job.runId === selectedRun.id) : undefined;
  const timeline = selectedJob?.events ?? [];
  const counts = useMemo(() => summarizeRuns(orderedRuns), [orderedRuns]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const previousOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousDrawerState = document.body.dataset.cognopticonDrawerOpen;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.dataset.cognopticonDrawerOpen = "run-history";
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
      <aside className="run-history-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <div>
            <p>{orderedRuns.length} recorded run{orderedRuns.length === 1 ? "" : "s"}</p>
            <h2 id={titleId}>Run history</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={onClose} aria-label="Close run history">
            <X size={18} aria-hidden />
          </button>
        </header>

        <section className="drawer-summary-strip" aria-label="Run history summary">
          <SummaryMetric label="Completed" value={counts.completed} />
          <SummaryMetric label="Active" value={counts.active} />
          <SummaryMetric label="Needs review" value={counts.needsReview} />
          <SummaryMetric label="Timeline events" value={timeline.length} />
        </section>

        {orderedRuns.length === 0 ? (
          <section className="run-history-empty">
            <strong>No runs recorded</strong>
            <p>Mission reviews and daemon-backed jobs will appear here after they are staged or dispatched.</p>
          </section>
        ) : (
          <div className="run-history-body">
            <nav aria-label="Recorded runs" className="run-history-list">
              {orderedRuns.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  className="run-history-item"
                  data-state={run.status}
                  aria-current={selectedRun?.id === run.id ? "true" : undefined}
                  onClick={() => onSelectRun(run.id)}
                >
                  <span>{run.status}</span>
                  <strong>{run.title}</strong>
                  <small><time dateTime={run.updatedAt}>{formatTimestamp(run.updatedAt)}</time></small>
                </button>
              ))}
            </nav>

            {selectedRun && (
              <section className="run-history-detail" aria-label={`${selectedRun.title} run details`}>
                <div className="run-history-detail-heading" data-state={selectedRun.status}>
                  <span>{selectedRun.status}</span>
                  <h3>{selectedRun.title}</h3>
                  <p>{selectedRun.summary}</p>
                </div>
                <dl>
                  <div>
                    <dt>Run id</dt>
                    <dd>{selectedRun.id}</dd>
                  </div>
                  <div>
                    <dt>Project id</dt>
                    <dd>{selectedRun.projectId}</dd>
                  </div>
                  {selectedRun.jobId && (
                    <div>
                      <dt>Daemon job</dt>
                      <dd>{selectedRun.jobId}</dd>
                    </div>
                  )}
                  {selectedRun.command && (
                    <div>
                      <dt>Command</dt>
                      <dd>{selectedRun.command}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Created</dt>
                    <dd><time dateTime={selectedRun.createdAt} title={selectedRun.createdAt}>{formatTimestamp(selectedRun.createdAt)}</time></dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd><time dateTime={selectedRun.updatedAt} title={selectedRun.updatedAt}>{formatTimestamp(selectedRun.updatedAt)}</time></dd>
                  </div>
                </dl>
                <section className="run-history-timeline" aria-label="Daemon event timeline">
                  <h4>Daemon event timeline</h4>
                  {timeline.length === 0 ? (
                    <p>No daemon event timeline is attached to this run.</p>
                  ) : (
                    <ol>
                      {timeline.map((event) => (
                        <li key={event.id}>
                          <span>{event.type.replace(/^job_/, "")}</span>
                          <strong>{event.summary}</strong>
                          <time dateTime={event.createdAt} title={event.createdAt}>{formatTimestamp(event.createdAt)}</time>
                          {event.stream && <em>{event.stream}{event.truncated ? " / truncated" : ""}</em>}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </section>
            )}
          </div>
        )}
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

function summarizeRuns(runs: RunRecord[]) {
  return runs.reduce(
    (counts, run) => {
      if (run.status === "completed") counts.completed += 1;
      if (run.status === "running" || run.status === "dispatched" || run.status === "approved") counts.active += 1;
      if (run.status === "failed" || run.status === "blocked" || run.status === "awaiting_approval") counts.needsReview += 1;
      return counts;
    },
    { completed: 0, active: 0, needsReview: 0 }
  );
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
