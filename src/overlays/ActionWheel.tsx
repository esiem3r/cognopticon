import { useState } from "react";
import type { CognopticonNode, NodeAction } from "../model/cognopticonNode";

interface ActionWheelProps {
  node: CognopticonNode;
  onMission: () => void;
}

export function ActionWheel({ node, onMission }: ActionWheelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  async function runAction(action: NodeAction) {
    if (action.kind === "generate_mission") {
      onMission();
      return;
    }
    if (action.kind === "open_path") {
      const path = typeof action.spec === "object" && action.spec && "path" in action.spec ? String(action.spec.path) : node.path;
      try {
        await navigator.clipboard?.writeText(path);
        setCopyFailed(null);
        setCopied(action.id);
      } catch {
        setCopied(null);
        setCopyFailed(action.id);
      }
    }
  }
  const actions = node.actions.filter((action) => action.kind === "generate_mission" || action.kind === "open_path").slice(0, 3);
  return (
    <div className="action-wheel" aria-label={`${node.name} actions`}>
      {actions.map((action) => (
        <button key={action.id} type="button" onClick={() => void runAction(action)}>
          {copied === action.id ? "Copied" : copyFailed === action.id ? "Copy unavailable" : action.label}
        </button>
      ))}
    </div>
  );
}
