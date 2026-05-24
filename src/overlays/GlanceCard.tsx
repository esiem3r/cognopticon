import type { CognopticonNode } from "../model/cognopticonNode";

interface GlanceCardProps {
  node: CognopticonNode;
  x: number;
  y: number;
}

export function GlanceCard({ node, x, y }: GlanceCardProps) {
  return (
    <aside className="glance-card" style={{ transform: `translate3d(${x + 18}px, ${y - 22}px, 0)` }}>
      <span>{node.kind} / {node.source.scanner}</span>
      <strong>{node.name}</strong>
      <dl>
        <div><dt>Ready</dt><dd>{node.state.readiness}</dd></div>
        <div><dt>Anom</dt><dd>{Math.round(node.visual.anomalyIntensity * 100)}</dd></div>
        <div><dt>State</dt><dd>{node.state.decision}</dd></div>
      </dl>
      {node.launch && <p>Launchable via {node.launch.mode}</p>}
    </aside>
  );
}
