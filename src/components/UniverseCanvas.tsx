import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { drawUniverse, hitTest, screenProjects, screenToWorld, type Camera } from "../lib/canvas";
import type { ProjectDossier, ProjectRelationship } from "../types/cosmopticon";

interface UniverseCanvasProps {
  projects: ProjectDossier[];
  relationships: ProjectRelationship[];
  selectedId: string;
  hoveredId: string | null;
  filteredIds: Set<string>;
  onSelect: (projectId: string) => void;
  onHover: (projectId: string | null) => void;
}

export function UniverseCanvas({
  projects,
  relationships,
  selectedId,
  hoveredId,
  filteredIds,
  onSelect,
  onHover
}: UniverseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; camera: Camera; moved: boolean } | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 30, y: -40, scale: 0.96 });
  const [size, setSize] = useState({ width: 1, height: 1 });

  const visibleProjects = useMemo(() => screenProjects(projects, camera, size), [camera, projects, size]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(size.width * pixelRatio));
    canvas.height = Math.max(1, Math.floor(size.height * pixelRatio));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
  }, [size]);

  useEffect(() => {
    let frame = 0;
    const render = (time: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (context) drawUniverse(context, projects, relationships, camera, selectedId, hoveredId, filteredIds, time);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [camera, filteredIds, hoveredId, projects, relationships, selectedId]);

  useEffect(() => {
    const selected = projects.find((project) => project.id === selectedId);
    if (!selected) return;
    if (!filteredIds.has(selectedId)) return;
    setCamera((current) => ({
      ...current,
      x: lerp(current.x, -selected.position.x, 0.22),
      y: lerp(current.y, -selected.position.y, 0.22)
    }));
  }, [filteredIds, projects, selectedId]);

  function pointerPoint(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  return (
    <div ref={containerRef} className="universe-frame">
      <canvas
        ref={canvasRef}
        className="universe-canvas"
        data-testid="universe-canvas"
        aria-label="Spatial project universe"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, camera, moved: false };
        }}
        onPointerMove={(event) => {
          const point = pointerPoint(event);
          const hovered = hitTest(visibleProjects, point);
          onHover(hovered?.id ?? null);
          const drag = dragRef.current;
          if (!drag) return;
          const dx = (event.clientX - drag.x) / camera.scale;
          const dy = (event.clientY - drag.y) / camera.scale;
          if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
          setCamera({ ...drag.camera, x: drag.camera.x + dx, y: drag.camera.y + dy });
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          const point = pointerPoint(event);
          const hit = hitTest(visibleProjects, point);
          if (hit && !drag?.moved) onSelect(hit.id);
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onWheel={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const before = screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, camera, rect);
          const nextScale = clamp(camera.scale * Math.exp(-event.deltaY * 0.0012), 0.42, 2.3);
          const afterCamera = { ...camera, scale: nextScale };
          const after = screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, afterCamera, rect);
          setCamera({
            scale: nextScale,
            x: camera.x + (after.x - before.x),
            y: camera.y + (after.y - before.y)
          });
        }}
      />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}
