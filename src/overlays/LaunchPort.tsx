import { useEffect, useState } from "react";
import type { DaemonStatus } from "../agency/types";
import type { CognopticonNode } from "../model/cognopticonNode";
import { formatManualLaunchCommand } from "./launchCommand";

type CopyStatus = {
  message: string;
  nonce: number;
};

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
  const [copyStatus, setCopyStatus] = useState<CopyStatus>({ message: "", nonce: 0 });
  useEffect(() => {
    resetCopyStatus();
  }, [node.id, manualCommandText]);
  useEffect(() => {
    if (runStatus) resetCopyStatus();
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
      updateCopyStatus(`Command copied: ${manualCommandText}`);
    } catch {
      updateCopyStatus("Clipboard unavailable. Command remains visible above.");
    }
  }
  function resetCopyStatus() {
    setCopyStatus({ message: "", nonce: 0 });
  }
  function updateCopyStatus(message: string) {
    setCopyStatus((current) => ({ message, nonce: current.nonce + 1 }));
  }
  function runLaunchCommand() {
    resetCopyStatus();
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
      <small className="launch-status" role="status" aria-atomic="true">
        {copyStatus.message || runStatus || (command ? "Command copy ready." : "Mission fallback ready.")}
        {copyStatus.nonce > 0 && <span className="sr-only"> Attempt {copyStatus.nonce}.</span>}
      </small>
    </section>
  );
}
