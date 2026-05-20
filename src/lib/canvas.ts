import { domainColors } from "./domain";
import type { ProjectDossier, ProjectRelationship } from "../types/cognopticon";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface ScreenProject extends ProjectDossier {
  screenX: number;
  screenY: number;
  radius: number;
}

export function worldToScreen(point: { x: number; y: number }, camera: Camera, rect: DOMRect | { width: number; height: number }) {
  return {
    x: rect.width / 2 + (point.x + camera.x) * camera.scale,
    y: rect.height / 2 + (point.y + camera.y) * camera.scale
  };
}

export function screenToWorld(point: { x: number; y: number }, camera: Camera, rect: DOMRect | { width: number; height: number }) {
  return {
    x: (point.x - rect.width / 2) / camera.scale - camera.x,
    y: (point.y - rect.height / 2) / camera.scale - camera.y
  };
}

export function projectRadius(project: ProjectDossier) {
  return 16 + project.substance * 26;
}

export function screenProjects(projects: ProjectDossier[], camera: Camera, rect: DOMRect | { width: number; height: number }): ScreenProject[] {
  return projects.map((project) => {
    const screen = worldToScreen(project.position, camera, rect);
    return { ...project, screenX: screen.x, screenY: screen.y, radius: projectRadius(project) * camera.scale };
  });
}

export function hitTest(projects: ScreenProject[], point: { x: number; y: number }) {
  return [...projects]
    .reverse()
    .find((project) => Math.hypot(project.screenX - point.x, project.screenY - point.y) <= Math.max(project.radius, 14));
}

export function drawUniverse(
  context: CanvasRenderingContext2D,
  projects: ProjectDossier[],
  relationships: ProjectRelationship[],
  camera: Camera,
  selectedId: string,
  hoveredId: string | null,
  filteredIds: Set<string>,
  time: number
) {
  const canvas = context.canvas;
  const width = canvas.width;
  const height = canvas.height;
  const pixelRatio = window.devicePixelRatio || 1;
  const rect = { width: width / pixelRatio, height: height / pixelRatio };
  context.save();
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, rect.width, rect.height);

  const gradient = context.createRadialGradient(rect.width * 0.52, rect.height * 0.48, 10, rect.width * 0.5, rect.height * 0.5, rect.width * 0.72);
  gradient.addColorStop(0, "#15212b");
  gradient.addColorStop(0.55, "#091117");
  gradient.addColorStop(1, "#05070a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, rect.width, rect.height);

  drawStarfield(context, rect.width, rect.height, camera);

  const byId = new Map(projects.map((project) => [project.id, project]));
  for (const relationship of relationships) {
    const source = byId.get(relationship.source);
    const target = byId.get(relationship.target);
    if (!source || !target) continue;
    const from = worldToScreen(source.position, camera, rect);
    const to = worldToScreen(target.position, camera, rect);
    const sourceVisible = filteredIds.has(source.id);
    const targetVisible = filteredIds.has(target.id);
    const active = source.id === selectedId || target.id === selectedId || source.id === hoveredId || target.id === hoveredId;
    context.beginPath();
    context.moveTo(from.x, from.y);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    context.quadraticCurveTo(midX + 18 * camera.scale, midY - 24 * camera.scale, to.x, to.y);
    context.strokeStyle = active ? "rgba(245, 238, 194, 0.72)" : sourceVisible && targetVisible ? "rgba(151, 177, 184, 0.26)" : "rgba(90, 110, 118, 0.12)";
    context.lineWidth = active ? 1.8 : Math.max(0.7, relationship.strength * 1.2);
    context.stroke();
  }

  for (const project of projects) {
    const screen = worldToScreen(project.position, camera, rect);
    const baseRadius = projectRadius(project) * camera.scale;
    const selected = project.id === selectedId;
    const hovered = project.id === hoveredId;
    const visible = filteredIds.has(project.id);
    const alpha = visible ? 1 : 0.18;
    const pulse = selected ? Math.sin(time / 340) * 3 + 6 : hovered ? 4 : 0;
    const color = domainColors[project.domain];
    const glowRadius = baseRadius + 24 + pulse;

    context.beginPath();
    const aura = context.createRadialGradient(screen.x, screen.y, 1, screen.x, screen.y, glowRadius);
    aura.addColorStop(0, withAlpha(color, selected ? 0.38 : 0.22 * project.activity));
    aura.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = aura;
    context.arc(screen.x, screen.y, glowRadius, 0, Math.PI * 2);
    context.fill();

    context.beginPath();
    context.fillStyle = withAlpha(color, alpha * (0.52 + project.activity * 0.36));
    context.strokeStyle = selected ? "#fff5c2" : healthStroke(project.health, alpha);
    context.lineWidth = selected ? 2.6 : hovered ? 2 : 1.2;
    context.arc(screen.x, screen.y, baseRadius, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.beginPath();
    context.fillStyle = `rgba(255,255,255,${0.18 * alpha})`;
    context.arc(screen.x - baseRadius * 0.34, screen.y - baseRadius * 0.34, Math.max(2, baseRadius * 0.18), 0, Math.PI * 2);
    context.fill();

    if (camera.scale > 0.58 || selected || hovered) {
      context.font = `${selected ? 13 : 12}px Inter, ui-sans-serif, system-ui`;
      context.fillStyle = `rgba(236,243,241,${selected || hovered ? 0.96 : 0.72 * alpha})`;
      context.textAlign = "center";
      context.fillText(project.name, screen.x, screen.y + baseRadius + 20);
    }
  }

  context.restore();
}

function drawStarfield(context: CanvasRenderingContext2D, width: number, height: number, camera: Camera) {
  context.save();
  for (let i = 0; i < 130; i += 1) {
    const x = (i * 97.31 + camera.x * 0.15) % width;
    const y = (i * 53.17 + camera.y * 0.12) % height;
    const radius = i % 9 === 0 ? 1.25 : 0.65;
    context.beginPath();
    context.fillStyle = i % 11 === 0 ? "rgba(252, 246, 205, 0.5)" : "rgba(182, 210, 218, 0.25)";
    context.arc(x < 0 ? x + width : x, y < 0 ? y + height : y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function healthStroke(health: ProjectDossier["health"], alpha: number) {
  const colors: Record<ProjectDossier["health"], string> = {
    strong: `rgba(177, 255, 176, ${0.8 * alpha})`,
    promising: `rgba(255, 239, 166, ${0.8 * alpha})`,
    fragile: `rgba(255, 169, 125, ${0.86 * alpha})`,
    stalled: `rgba(181, 186, 194, ${0.72 * alpha})`,
    unknown: `rgba(155, 170, 178, ${0.66 * alpha})`
  };
  return colors[health];
}

function withAlpha(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
