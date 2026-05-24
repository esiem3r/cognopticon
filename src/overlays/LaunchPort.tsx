import type { DaemonStatus } from "../agency/types";
import type { CognopticonNode } from "../model/cognopticonNode";

export function LaunchPort({
  node,
  daemonStatus,
  runStatus,
  onMission,
  onRun
}: {
  node: CognopticonNode;
  daemonStatus: DaemonStatus;
  runStatus?: string;
  onMission: () => void;
  onRun: () => void;
}) {
  if (!node.launch) {
    return (
      <section className="launch-port muted">
        <span>LaunchPort / mission fallback</span>
        <strong>No launch spec</strong>
        <p>This node can still generate a bounded mission packet with its path, evidence, constraints, and verification expectations.</p>
        <button type="button" onClick={onMission}>Generate Mission</button>
      </section>
    );
  }
  const command = node.launch.commands?.[0];
  return (
    <section className="launch-port">
      <span>LaunchPort / {daemonStatus.online ? "daemon-ready" : "copy fallback"}</span>
      <strong>{node.launch.label}</strong>
      {command && <code>{command.command} {command.args.join(" ")}</code>}
      <p>
        {daemonStatus.online
          ? "Daemon is online; registered actions still require allowed roots and command allowlists."
          : "Daemon is offline. Use the mission packet or copy the allowlisted command; no local action will be run from the browser."}
      </p>
      <div className="launch-actions">
        <button type="button" onClick={onRun} disabled={!daemonStatus.online || !command}>
          Run
        </button>
        <button type="button" onClick={onMission}>Mission</button>
      </div>
      {runStatus && <small>{runStatus}</small>}
    </section>
  );
}
