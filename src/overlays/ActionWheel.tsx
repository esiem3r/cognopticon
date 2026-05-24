import { useEffect, useState } from "react";
import type { CognopticonNode, NodeAction } from "../model/cognopticonNode";

interface ActionWheelProps {
  node: CognopticonNode;
  onMission: () => void;
}

export function ActionWheel({ node, onMission }: ActionWheelProps) {
  const [copyStatus, setCopyStatus] = useState<{ message: string; nonce: number }>({ message: "", nonce: 0 });
  useEffect(() => {
    setCopyStatus({ message: "", nonce: 0 });
  }, [node.id]);

  async function runAction(action: NodeAction) {
    if (action.kind === "generate_mission") {
      setCopyStatus({ message: "", nonce: 0 });
      onMission();
      return;
    }
    if (action.kind === "open_path") {
      const path = typeof action.spec === "object" && action.spec && "path" in action.spec ? String(action.spec.path) : node.path;
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
        await navigator.clipboard?.writeText(path);
        updateCopyStatus("Path copied.");
      } catch {
        updateCopyStatus("Clipboard unavailable. Open Detail to inspect the path.");
      }
    }
  }
  function updateCopyStatus(message: string) {
    setCopyStatus((current) => ({ message, nonce: current.nonce + 1 }));
  }
  const actions = node.actions.filter((action) => action.kind === "generate_mission" || action.kind === "open_path").slice(0, 3);
  return (
    <div className="action-wheel" aria-label={`${node.name} actions`}>
      <div className="action-wheel-buttons">
        {actions.map((action) => (
          <button key={action.id} type="button" onClick={() => void runAction(action)}>
            {action.label}
          </button>
        ))}
      </div>
      <small className="action-status" role="status" aria-atomic="true">
        {copyStatus.message || "Copy path fallback ready."}
        {copyStatus.nonce > 0 && <span className="sr-only"> Attempt {copyStatus.nonce}.</span>}
      </small>
    </div>
  );
}
