import { useEffect, useState } from "react";
import type { DaemonStatus } from "../agency/types";
import type { CognopticonNode } from "../model/cognopticonNode";
import { formatManualLaunchCommand } from "./launchCommand";

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
  const command = node.launch?.commands?.[0];
  const manualCommandText = command ? formatManualLaunchCommand(command) : "";
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    setCopyStatus("");
  }, [node.id, manualCommandText]);
  useEffect(() => {
    if (runStatus) setCopyStatus("");
  }, [runStatus]);

  if (!node.launch) {
    return (
      <section className="launch-port muted" aria-label={`${node.name} launch port`}>
        <span>LaunchPort / mission fallback</span>
        <strong>No launch spec</strong>
        <p>This node can still generate a bounded mission packet with its path, evidence, constraints, and verification expectations.</p>
        <button type="button" onClick={onMission}>Generate Mission</button>
      </section>
    );
  }
  async function copyCommand() {
    if (!manualCommandText) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(manualCommandText);
      setCopyStatus(`Command copied: ${manualCommandText}`);
    } catch {
      setCopyStatus("Clipboard unavailable. Command remains visible above.");
    }
  }
  function runLaunchCommand() {
    setCopyStatus("");
    onRun();
  }
  return (
    <section className="launch-port" aria-label={`${node.name} launch port`}>
      <span>LaunchPort / {daemonStatus.online ? "daemon-ready" : "copy fallback"}</span>
      <strong>{node.launch.label}</strong>
      {command && <code>{manualCommandText}</code>}
      <p>
        {daemonStatus.online
          ? "Daemon is online; registered actions still require allowed roots and command allowlists."
          : "Daemon is offline. Copy the allowlisted command or generate a mission packet; no local action will be run from the browser."}
      </p>
      <div className="launch-actions">
        <button type="button" onClick={runLaunchCommand} disabled={!daemonStatus.online || !command}>
          Run
        </button>
        {command && <button type="button" onClick={() => void copyCommand()}>Copy Command</button>}
        <button type="button" onClick={onMission}>Mission</button>
      </div>
      <small className="launch-status" role="status" aria-atomic="true">{copyStatus || runStatus || (command ? "Command copy ready." : "Mission fallback ready.")}</small>
    </section>
  );
}
