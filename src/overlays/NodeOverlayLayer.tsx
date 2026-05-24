import type { CognopticonNode } from "../model/cognopticonNode";
import { GlanceCard } from "./GlanceCard";

export interface ScreenNode {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

interface NodeOverlayLayerProps {
  nodes: CognopticonNode[];
  screenNodes: ScreenNode[];
  hoveredId: string | null;
}

export function NodeOverlayLayer({ nodes, screenNodes, hoveredId }: NodeOverlayLayerProps) {
  const hovered = nodes.find((node) => node.id === hoveredId);
  const screen = screenNodes.find((node) => node.id === hoveredId && node.visible);
  return <div className="node-overlay-layer">{hovered && screen && <GlanceCard node={hovered} x={screen.x} y={screen.y} />}</div>;
}
