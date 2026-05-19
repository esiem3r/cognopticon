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
  graphGroup: THREE.Group;
  projectGroup: THREE.Group;
  linkGroup: THREE.Group;
  starField: THREE.Points;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  projectMeshes: Map<string, THREE.Mesh>;
  target: THREE.Vector3;
  desiredTarget: THREE.Vector3;
  desiredPosition: THREE.Vector3;
  panVelocity: THREE.Vector3;
  dollyVelocity: number;
  rotationVelocity: THREE.Vector2;
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
  const lastFlownSelectionRef = useRef<string | null>(null);
  const [labels, setLabels] = useState<ProjectLabel[]>([]);

  const projectPositions = useMemo(() => {
    return new Map(projects.map((project, index) => [project.id, projectVector(project, index)]));
  }, [projects]);

  const latestRef = useRef({ projects, projectPositions, selectedId, hoveredId, onSelect, onHover });
  latestRef.current = { projects, projectPositions, selectedId, hoveredId, onSelect, onHover };

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

    const graphGroup = new THREE.Group();
    const projectGroup = new THREE.Group();
    const linkGroup = new THREE.Group();
    const starField = createStarField();
    scene.add(createNebulaShell());
    graphGroup.add(createLatentCloud());
    scene.add(starField);
    graphGroup.add(linkGroup);
    graphGroup.add(projectGroup);
    scene.add(graphGroup);
    scene.add(new THREE.AmbientLight("#c3efff", 1.1));

    const keyLight = new THREE.PointLight("#fff2bf", 1400, 3200);
    keyLight.position.set(-360, 460, 520);
    scene.add(keyLight);

    refs.current = {
      scene,
      camera,
      renderer,
      graphGroup,
      projectGroup,
      linkGroup,
      starField,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      projectMeshes: new Map(),
      target: new THREE.Vector3(0, 0, 0),
      desiredTarget: new THREE.Vector3(0, 260, 0),
      desiredPosition: new THREE.Vector3(0, 260, 900),
      panVelocity: new THREE.Vector3(),
      dollyVelocity: 0,
      rotationVelocity: new THREE.Vector2()
    };
    camera.position.copy(refs.current.desiredPosition);

    let pointerActive = false;
    let movedDuringDrag = false;
    let lastX = 0;
    let lastY = 0;

    const handlePointerDown = (event: PointerEvent) => {
      pointerActive = true;
      movedDuringDrag = false;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = refs.current;
      if (!state) return;
      const hitId = pickProjectFromState(state, event.clientX, event.clientY);
      latestRef.current.onHover(hitId ?? null);
      if (!pointerActive) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 2) movedDuringDrag = true;
      if (event.shiftKey) panObserver(state, dx, dy);
      else rotateGraph(state, dx, dy);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const state = refs.current;
      if (!state) return;
      renderer.domElement.releasePointerCapture(event.pointerId);
      pointerActive = false;
      const hitId = pickProjectFromState(state, event.clientX, event.clientY);
      if (hitId && !movedDuringDrag) latestRef.current.onSelect(hitId);
    };

    const handlePointerLeave = () => {
      latestRef.current.onHover(null);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const state = refs.current;
      if (!state) return;
      if (event.shiftKey) {
        panObserver(state, -event.deltaX * 1.15, -event.deltaY * 1.15);
      } else {
        dollyObserver(state, event.deltaY);
      }
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

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
      updateGraphRotation(state);
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
      const latest = latestRef.current;
      const next = latest.projects.map((project, index) => {
        const position = latest.projectPositions.get(project.id) ?? projectVector(project, index);
        const worldPosition = position.clone().applyMatrix4(state.graphGroup.matrixWorld);
        const projected = worldPosition.clone().project(state.camera);
        const active = project.id === latest.selectedId || project.id === latest.hoveredId;
        return {
          id: project.id,
          name: project.name,
          x: (projected.x * 0.5 + 0.5) * rect.width,
          y: (-projected.y * 0.5 + 0.5) * rect.height,
          visible: projected.z < 1 && (active || state.camera.position.distanceTo(worldPosition) < 1100),
          active
        };
      });
      setLabels(next);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      refs.current = null;
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      disposeGroup(projectGroup);
      disposeGroup(linkGroup);
      disposeGroup(graphGroup);
      disposeObject(starField);
    };
  }, []);

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

  return (
    <div ref={mountRef} className="universe-frame three-universe">
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
  const warm = new THREE.Color("#fff2bf");
  const radius = 12 + project.substance * 20;
  const group = new THREE.Group();
  group.userData.projectId = project.id;

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 40),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: active ? 1.25 : visible ? 0.62 : 0.12,
      roughness: 0.28,
      metalness: 0.08,
      transparent: true,
      opacity: visible ? 0.96 : 0.18
    })
  );
  sphere.userData.projectId = project.id;
  group.add(sphere);

  const fresnel = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.06, 64, 40),
    new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: active ? warm : color },
        opacity: { value: active ? 0.72 : visible ? 0.42 : 0.08 }
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform float opacity;
        varying vec3 vNormal;
        void main() {
          float rim = pow(1.0 - abs(vNormal.z), 2.25);
          gl_FragColor = vec4(glowColor, rim * opacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  fresnel.userData.projectId = project.id;
  group.add(fresnel);

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity: active ? 0.42 : visible ? 0.22 : 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  const spriteScale = radius * (active ? 3.1 : 2.35);
  sprite.scale.set(spriteScale, spriteScale, 1);
  sprite.userData.projectId = project.id;
  group.add(sprite);

  const coreLight = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: "#ffffff",
      transparent: true,
      opacity: active ? 0.28 : visible ? 0.16 : 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  coreLight.scale.set(radius * 1.4, radius * 1.4, 1);
  coreLight.position.set(-radius * 0.22, radius * 0.18, radius * 0.5);
  coreLight.userData.projectId = project.id;
  group.add(coreLight);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * (active ? 1.6 : 1.35), 48, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: active ? 0.11 : visible ? 0.06 : 0.018,
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
      opacity: active ? 0.72 : visible ? 0.34 : 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  ring.rotation.x = Math.PI * 0.58;
  ring.rotation.y = Math.PI * 0.18;
  group.add(ring);

  const polarRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.28, Math.max(0.55, radius * 0.018), 8, 96),
    new THREE.MeshBasicMaterial({
      color: active ? "#ffffff" : color,
      transparent: true,
      opacity: active ? 0.3 : visible ? 0.12 : 0.035,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  polarRing.rotation.x = Math.PI * 0.08;
  polarRing.rotation.y = Math.PI * 0.72;
  polarRing.rotation.z = Math.PI * 0.18;
  group.add(polarRing);

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
      map: pointTexture(),
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
      map: pointTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
}

let cachedGlowTexture: THREE.Texture | null = null;
let cachedPointTexture: THREE.Texture | null = null;

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

function pointTexture() {
  if (cachedPointTexture) return cachedPointTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.28)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  cachedPointTexture = new THREE.CanvasTexture(canvas);
  return cachedPointTexture;
}

function updateCamera(state: SceneRefs) {
  if (state.panVelocity.lengthSq() > 0.0001) {
    state.desiredPosition.add(state.panVelocity);
    state.desiredTarget.add(state.panVelocity);
    state.panVelocity.multiplyScalar(0.82);
  }
  if (Math.abs(state.dollyVelocity) > 0.001) {
    applyDolly(state, state.dollyVelocity);
    state.dollyVelocity *= 0.78;
  }
  state.target.lerp(state.desiredTarget, 0.16);
  state.camera.position.lerp(state.desiredPosition, 0.16);
  state.camera.lookAt(state.target);
}

function updateGraphRotation(state: SceneRefs) {
  if (Math.abs(state.rotationVelocity.x) <= 0.00001 && Math.abs(state.rotationVelocity.y) <= 0.00001) return;
  state.graphGroup.rotation.y += state.rotationVelocity.x;
  state.graphGroup.rotation.x = clamp(state.graphGroup.rotation.x + state.rotationVelocity.y, -0.85, 0.85);
  state.rotationVelocity.multiplyScalar(0.86);
}

function rotateGraph(state: SceneRefs, dx: number, dy: number) {
  state.rotationVelocity.x += dx * 0.00072;
  state.rotationVelocity.y += dy * 0.00056;
  state.rotationVelocity.multiplyScalar(0.72);
}

function panObserver(state: SceneRefs, dx: number, dy: number) {
  const distance = state.desiredPosition.distanceTo(state.desiredTarget);
  const scale = clamp(distance / 860, 0.22, 1.55);
  const forward = state.desiredTarget.clone().sub(state.desiredPosition).normalize();
  const right = new THREE.Vector3().crossVectors(forward, state.camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const movement = right.multiplyScalar(-dx * scale * 0.62).add(up.multiplyScalar(dy * scale * 0.62));
  state.panVelocity.add(movement);
  state.panVelocity.multiplyScalar(0.72);
}

function dollyObserver(state: SceneRefs, deltaY: number) {
  const impulse = clamp(Math.abs(deltaY) * 0.28, 5, 90) * Math.sign(deltaY);
  state.dollyVelocity = state.dollyVelocity * 0.35 + impulse;
}

function applyDolly(state: SceneRefs, amount: number) {
  const forward = state.desiredTarget.clone().sub(state.desiredPosition).normalize();
  const distance = state.desiredPosition.distanceTo(state.desiredTarget);
  const nextDistance = clamp(distance + amount, 360, 2250);
  const change = nextDistance - distance;
  state.desiredPosition.add(forward.multiplyScalar(-change));
  if (nextDistance > 1080) {
    const overview = new THREE.Vector3(0, 260, 0);
    const amountToCenter = Math.min(1, (nextDistance - 1080) / 560);
    const shift = overview.sub(state.desiredTarget).multiplyScalar(amountToCenter * 0.46);
    state.desiredTarget.add(shift);
    state.desiredPosition.add(shift);
  }
}

function pickProjectFromState(state: SceneRefs, clientX: number, clientY: number) {
  const rect = state.renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, state.camera);
  const hits = state.raycaster.intersectObjects(Array.from(state.projectMeshes.values()), true);
  const hit = hits.find((item) => item.object.userData.projectId || item.object.parent?.userData.projectId);
  return hit?.object.userData.projectId ?? hit?.object.parent?.userData.projectId;
}

function flyToProject(state: SceneRefs, position: THREE.Vector3) {
  const currentDirection = state.desiredPosition.clone().sub(state.desiredTarget);
  if (currentDirection.lengthSq() < 1) currentDirection.set(0, 120, 520);
  currentDirection.normalize();
  state.desiredTarget.copy(position);
  state.desiredPosition.copy(position).add(currentDirection.multiplyScalar(620));
  state.panVelocity.set(0, 0, 0);
  state.dollyVelocity = 0;
  state.rotationVelocity.set(0, 0);
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
