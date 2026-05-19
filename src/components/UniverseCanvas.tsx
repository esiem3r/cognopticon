import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { domainColors } from "../lib/domain";
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

interface ProjectLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  visible: boolean;
  active: boolean;
}

interface SceneRefs {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  projectGroup: THREE.Group;
  linkGroup: THREE.Group;
  starField: THREE.Points;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  projectMeshes: Map<string, THREE.Mesh>;
  target: THREE.Vector3;
  desiredTarget: THREE.Vector3;
  desiredPosition: THREE.Vector3;
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
  const mountRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<SceneRefs | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const lastFlownSelectionRef = useRef<string | null>(null);
  const [labels, setLabels] = useState<ProjectLabel[]>([]);

  const projectPositions = useMemo(() => {
    return new Map(projects.map((project, index) => [project.id, projectVector(project, index)]));
  }, [projects]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#020407");
    scene.fog = new THREE.FogExp2("#020407", 0.0018);

    const camera = new THREE.PerspectiveCamera(48, 1, 1, 3800);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = "universe-canvas";
    renderer.domElement.dataset.testid = "universe-canvas";
    renderer.domElement.setAttribute("aria-label", "Spatial project universe");
    mount.appendChild(renderer.domElement);

    const projectGroup = new THREE.Group();
    const linkGroup = new THREE.Group();
    const starField = createStarField();
    scene.add(createNebulaShell());
    scene.add(createLatentCloud());
    scene.add(starField);
    scene.add(linkGroup);
    scene.add(projectGroup);
    scene.add(new THREE.AmbientLight("#c3efff", 1.1));

    const keyLight = new THREE.PointLight("#fff2bf", 1400, 3200);
    keyLight.position.set(-360, 460, 520);
    scene.add(keyLight);

    refs.current = {
      scene,
      camera,
      renderer,
      projectGroup,
      linkGroup,
      starField,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      projectMeshes: new Map(),
      target: new THREE.Vector3(0, 0, 0),
      desiredTarget: new THREE.Vector3(0, 260, 0),
      desiredPosition: new THREE.Vector3(0, 260, 680)
    };
    camera.position.copy(refs.current.desiredPosition);

    const observer = new ResizeObserver(() => resize());
    observer.observe(mount);
    resize();

    let frame = 0;
    const animate = (time: number) => {
      const state = refs.current;
      if (!state) return;
      state.starField.rotation.y = time * 0.000025;
      state.projectGroup.children.forEach((child) => {
        child.rotation.y += 0.006;
        child.rotation.x += 0.002;
      });
      updateCamera(state);
      state.renderer.render(state.scene, state.camera);
      updateLabels(state);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    function resize() {
      const state = refs.current;
      if (!state || !mount) return;
      const rect = mount.getBoundingClientRect();
      state.camera.aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
      state.camera.updateProjectionMatrix();
      state.renderer.setSize(Math.max(rect.width, 1), Math.max(rect.height, 1), false);
    }

    function updateLabels(state: SceneRefs) {
      const rect = state.renderer.domElement.getBoundingClientRect();
      const next = projects.map((project, index) => {
        const position = projectPositions.get(project.id) ?? projectVector(project, index);
        const projected = position.clone().project(state.camera);
        const active = project.id === selectedId || project.id === hoveredId;
        return {
          id: project.id,
          name: project.name,
          x: (projected.x * 0.5 + 0.5) * rect.width,
          y: (-projected.y * 0.5 + 0.5) * rect.height,
          visible: projected.z < 1 && (active || state.camera.position.distanceTo(position) < 980),
          active
        };
      });
      setLabels(next);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      refs.current = null;
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      disposeGroup(projectGroup);
      disposeGroup(linkGroup);
      disposeObject(starField);
    };
  }, [hoveredId, projectPositions, projects, selectedId]);

  useEffect(() => {
    const state = refs.current;
    if (!state) return;
    state.projectGroup.clear();
    state.linkGroup.clear();
    state.projectMeshes.clear();

    for (const [index, project] of projects.entries()) {
      const position = projectPositions.get(project.id) ?? projectVector(project, index);
      const visible = filteredIds.has(project.id);
      const active = project.id === selectedId || project.id === hoveredId;
      const mesh = createProjectBody(project, visible, active);
      mesh.position.copy(position);
      mesh.userData.projectId = project.id;
      state.projectGroup.add(mesh);
      state.projectMeshes.set(project.id, mesh);
    }

    for (const relationship of relationships) {
      const source = projectPositions.get(relationship.source);
      const target = projectPositions.get(relationship.target);
      if (!source || !target) continue;
      const sourceVisible = filteredIds.has(relationship.source);
      const targetVisible = filteredIds.has(relationship.target);
      const active = relationship.source === selectedId || relationship.target === selectedId;
      state.linkGroup.add(createRelationshipFilament(source, target, relationship, sourceVisible && targetVisible, active));
    }

  }, [filteredIds, hoveredId, projectPositions, projects, relationships, selectedId]);

  useEffect(() => {
    const state = refs.current;
    const selectedPosition = projectPositions.get(selectedId);
    if (!state || !selectedPosition || !filteredIds.has(selectedId)) return;
    if (lastFlownSelectionRef.current === selectedId) return;
    flyToProject(state, selectedPosition);
    lastFlownSelectionRef.current = selectedId;
  }, [filteredIds, projectPositions, selectedId]);

  function pickProject(clientX: number, clientY: number) {
    const state = refs.current;
    const mount = mountRef.current;
    if (!state || !mount) return undefined;
    const rect = mount.getBoundingClientRect();
    state.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    state.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    state.raycaster.setFromCamera(state.pointer, state.camera);
    const hits = state.raycaster.intersectObjects(Array.from(state.projectMeshes.values()), true);
    const hit = hits.find((item) => item.object.userData.projectId || item.object.parent?.userData.projectId);
    return hit?.object.userData.projectId ?? hit?.object.parent?.userData.projectId;
  }

  return (
    <div
      ref={mountRef}
      className="universe-frame three-universe"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
      }}
      onPointerMove={(event) => {
        const hitId = pickProject(event.clientX, event.clientY);
        onHover(hitId ?? null);
        const drag = dragRef.current;
        const state = refs.current;
        if (!drag || !state) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        panObserver(state, dx, dy);
        drag.x = event.clientX;
        drag.y = event.clientY;
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        const hitId = pickProject(event.clientX, event.clientY);
        if (hitId && !drag?.moved) onSelect(hitId);
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      onWheel={(event) => {
        event.preventDefault();
        const state = refs.current;
        if (!state) return;
        dollyObserver(state, event.deltaY);
      }}
    >
      <div className="latent-haze" aria-hidden />
      <div className="project-label-layer" aria-hidden>
        {labels.map((label) => (
          <span
            key={label.id}
            className={label.active ? "project-label active" : "project-label"}
            style={{ transform: `translate3d(${label.x}px, ${label.y}px, 0)`, opacity: label.visible ? 1 : 0 }}
          >
            {label.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function projectVector(project: ProjectDossier, index: number) {
  const domainLift: Record<ProjectDossier["domain"], number> = {
    agentics: 0.38,
    memory: -0.08,
    research: 0.18,
    visualization: 0.02,
    corpus: -0.34,
    operations: 0.28,
    infrastructure: -0.18,
    writing: 0.48
  };
  const z = (domainLift[project.domain] + Math.sin(index * 1.7) * 0.28) * 520;
  return new THREE.Vector3(project.position.x * 1.18, -project.position.y * 1.05 + 320, z);
}

function createProjectBody(project: ProjectDossier, visible: boolean, active: boolean) {
  const color = new THREE.Color(domainColors[project.domain]);
  const radius = 12 + project.substance * 20;
  const group = new THREE.Group();
  group.userData.projectId = project.id;

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: visible ? 0.96 : 0.18
    })
  );
  sphere.userData.projectId = project.id;
  group.add(sphere);

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity: active ? 0.78 : visible ? 0.46 : 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  const spriteScale = radius * (active ? 4.35 : 3.5);
  sprite.scale.set(spriteScale, spriteScale, 1);
  sprite.userData.projectId = project.id;
  group.add(sprite);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * (active ? 2.15 : 1.85), 48, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: active ? 0.18 : visible ? 0.13 : 0.026,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  halo.userData.projectId = project.id;
  group.add(halo);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.72, Math.max(0.8, radius * 0.03), 8, 96),
    new THREE.MeshBasicMaterial({
      color: active ? "#fff2bf" : color,
      transparent: true,
      opacity: active ? 0.9 : visible ? 0.5 : 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  ring.rotation.x = Math.PI * 0.58;
  ring.rotation.y = Math.PI * 0.18;
  group.add(ring);

  return group as unknown as THREE.Mesh;
}

function createRelationshipFilament(
  source: THREE.Vector3,
  target: THREE.Vector3,
  relationship: ProjectRelationship,
  visible: boolean,
  active: boolean
) {
  const middle = source.clone().lerp(target, 0.5);
  middle.z += 90 + relationship.strength * 120;
  middle.y += Math.sin(relationship.strength * Math.PI) * 48;
  const curve = new THREE.QuadraticBezierCurve3(source, middle, target);
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(64));
  const material = new THREE.LineBasicMaterial({
    color: active ? "#fff0b8" : "#9bd6e2",
    transparent: true,
    opacity: active ? 0.82 : visible ? 0.34 : 0.08,
    blending: THREE.AdditiveBlending
  });
  return new THREE.Line(geometry, material);
}

function createStarField() {
  const count = 2600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = 420 + Math.random() * 1500;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[index * 3 + 2] = radius * Math.cos(phi);
    const tint = new THREE.Color(index % 7 === 0 ? "#ffe9a6" : index % 5 === 0 ? "#f59bd8" : "#9fd7ff");
    colors[index * 3] = tint.r;
    colors[index * 3 + 1] = tint.g;
    colors[index * 3 + 2] = tint.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 3.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
}

function createNebulaShell() {
  const geometry = new THREE.SphereGeometry(1800, 64, 32);
  const material = new THREE.MeshBasicMaterial({
    color: "#334566",
    transparent: true,
    opacity: 0.18,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  return new THREE.Mesh(geometry, material);
}

function createLatentCloud() {
  const count = 420;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = index * 0.29;
    const radius = 80 + index * 2.2;
    positions[index * 3] = Math.cos(angle) * radius + THREE.MathUtils.randFloatSpread(120);
    positions[index * 3 + 1] = Math.sin(angle * 0.72) * 180 + THREE.MathUtils.randFloatSpread(140);
    positions[index * 3 + 2] = Math.sin(angle) * radius * 0.75 + THREE.MathUtils.randFloatSpread(180);
    const tint = new THREE.Color(index % 3 === 0 ? "#f98ad4" : index % 3 === 1 ? "#80e4c9" : "#81d4ff");
    colors[index * 3] = tint.r;
    colors[index * 3 + 1] = tint.g;
    colors[index * 3 + 2] = tint.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 12,
      vertexColors: true,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
}

let cachedGlowTexture: THREE.Texture | null = null;

function glowTexture() {
  if (cachedGlowTexture) return cachedGlowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.22, "rgba(255,255,255,0.72)");
    gradient.addColorStop(0.58, "rgba(255,255,255,0.18)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  cachedGlowTexture = new THREE.CanvasTexture(canvas);
  return cachedGlowTexture;
}

function updateCamera(state: SceneRefs) {
  state.target.lerp(state.desiredTarget, 0.16);
  state.camera.position.lerp(state.desiredPosition, 0.16);
  state.camera.lookAt(state.target);
}

function panObserver(state: SceneRefs, dx: number, dy: number) {
  const distance = state.desiredPosition.distanceTo(state.desiredTarget);
  const scale = clamp(distance / 760, 0.42, 1.8);
  const forward = state.desiredTarget.clone().sub(state.desiredPosition).normalize();
  const right = new THREE.Vector3().crossVectors(forward, state.camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const movement = right.multiplyScalar(-dx * scale).add(up.multiplyScalar(dy * scale));
  state.desiredPosition.add(movement);
  state.desiredTarget.add(movement);
}

function dollyObserver(state: SceneRefs, deltaY: number) {
  const forward = state.desiredTarget.clone().sub(state.desiredPosition).normalize();
  const distance = state.desiredPosition.distanceTo(state.desiredTarget);
  const amount = clamp(Math.abs(deltaY) * 0.95, 18, 240) * Math.sign(deltaY);
  const nextDistance = clamp(distance + amount, 130, 1550);
  const change = nextDistance - distance;
  state.desiredPosition.add(forward.multiplyScalar(-change));
}

function flyToProject(state: SceneRefs, position: THREE.Vector3) {
  const currentDirection = state.desiredPosition.clone().sub(state.desiredTarget);
  if (currentDirection.lengthSq() < 1) currentDirection.set(0, 120, 520);
  currentDirection.normalize();
  state.desiredTarget.copy(position);
  state.desiredPosition.copy(position).add(currentDirection.multiplyScalar(420));
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => disposeObject(object));
}

function disposeObject(object: THREE.Object3D) {
  const maybeMesh = object as THREE.Mesh;
  maybeMesh.geometry?.dispose();
  const material = maybeMesh.material;
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material?.dispose();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
