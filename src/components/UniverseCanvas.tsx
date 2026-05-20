import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { domainColors } from "../lib/domain";
import type { ProjectDossier, ProjectRelationship } from "../types/cognopticon";

const UNIVERSE_RADIUS = 500;
const CAMERA_NEAR_DISTANCE = 300;
const CAMERA_FAR_DISTANCE = 1450;

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
    graphGroup.add(createBoundarySphere());
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
      desiredTarget: new THREE.Vector3(0, 0, 0),
      desiredPosition: new THREE.Vector3(0, 0, 1220),
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
      else orbitObserver(state, dx, dy);
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
      } else if (event.ctrlKey || event.metaKey) {
        pinchZoomObserver(state, event.deltaY);
      } else {
        trackpadGlideObserver(state, event.deltaX, event.deltaY);
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
      updateObserverOrbit(state);
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
  if (project.id === "cognopticon") return new THREE.Vector3(0, 0, 0);

  const domainAngle: Record<ProjectDossier["domain"], number> = {
    visualization: 0.15,
    agentics: 0.92,
    operations: 1.76,
    infrastructure: 2.5,
    memory: 3.2,
    corpus: 4.0,
    research: 4.82,
    writing: 5.56
  };
  const normalizedIndex = Math.max(index - 1, 0);
  const shell = 0.54 + (project.substance * 0.28) + (project.activity * 0.14);
  const radius = clamp(shell * UNIVERSE_RADIUS, 300, UNIVERSE_RADIUS - 52);
  const theta = domainAngle[project.domain] + Math.sin(normalizedIndex * 1.41) * 0.26 + (normalizedIndex % 3) * 0.16;
  const phi = 0.62 + ((normalizedIndex * 0.47) % 1.9);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function createProjectBody(project: ProjectDossier, visible: boolean, active: boolean) {
  const color = new THREE.Color(domainColors[project.domain]);
  const warm = new THREE.Color("#fff2bf");
  const isCenter = project.id === "cognopticon";
  const radius = isCenter ? 31 : 8 + project.substance * 12;
  const group = new THREE.Group();
  group.userData.projectId = project.id;

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: visible ? 0.92 : 0.18,
      blending: THREE.AdditiveBlending
    })
  );
  sphere.userData.projectId = project.id;
  group.add(sphere);

  const innerCore = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.46, 32, 24),
    new THREE.MeshBasicMaterial({
      color: color.clone().lerp(new THREE.Color("#ffffff"), active ? 0.72 : 0.52),
      transparent: true,
      opacity: active ? 0.96 : visible ? 0.78 : 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  innerCore.userData.projectId = project.id;
  group.add(innerCore);

  const fresnel = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.06, 64, 40),
    new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: active ? warm : color },
        opacity: { value: active ? 0.95 : visible ? 0.58 : 0.12 }
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
      opacity: active ? 0.86 : visible ? 0.52 : 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  const spriteScale = radius * (active ? 5.1 : visible ? 4.1 : 2.2);
  sprite.scale.set(spriteScale, spriteScale, 1);
  sprite.userData.projectId = project.id;
  group.add(sprite);

  const coreLight = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: active ? "#fff2bf" : "#ffffff",
      transparent: true,
      opacity: active ? 0.5 : visible ? 0.28 : 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  coreLight.scale.set(radius * 1.4, radius * 1.4, 1);
  coreLight.position.set(-radius * 0.22, radius * 0.18, radius * 0.5);
  coreLight.userData.projectId = project.id;
  group.add(coreLight);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * (isCenter ? 2.15 : 1.85), Math.max(0.5, radius * 0.018), 8, 128),
    new THREE.MeshBasicMaterial({
      color: active ? "#fff2bf" : color,
      transparent: true,
      opacity: active || isCenter ? 0.62 : visible ? 0.1 : 0.025,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  ring.rotation.x = Math.PI * 0.58;
  ring.rotation.y = Math.PI * 0.18;
  group.add(ring);

  const polarRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius * (isCenter ? 1.58 : 1.38), Math.max(0.38, radius * 0.012), 8, 128),
    new THREE.MeshBasicMaterial({
      color: active ? "#ffffff" : color,
      transparent: true,
      opacity: active || isCenter ? 0.34 : visible ? 0.045 : 0.015,
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
  const outward = middle.lengthSq() > 1 ? middle.clone().normalize() : new THREE.Vector3(0, 1, 0);
  middle.add(outward.multiplyScalar(42 + relationship.strength * 94));
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

function createBoundarySphere() {
  const group = new THREE.Group();

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(UNIVERSE_RADIUS, 96, 48),
    new THREE.MeshBasicMaterial({
      color: "#74d8ff",
      transparent: true,
      opacity: 0.028,
      wireframe: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  group.add(shell);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: "#f98ad4",
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const equator = new THREE.Mesh(new THREE.TorusGeometry(UNIVERSE_RADIUS, 0.9, 8, 192), ringMaterial.clone());
  equator.rotation.x = Math.PI / 2;
  group.add(equator);

  const meridian = new THREE.Mesh(new THREE.TorusGeometry(UNIVERSE_RADIUS, 0.72, 8, 192), ringMaterial.clone());
  meridian.rotation.y = Math.PI / 2;
  meridian.material.color = new THREE.Color("#80e4c9");
  meridian.material.opacity = 0.095;
  group.add(meridian);

  const tilted = new THREE.Mesh(new THREE.TorusGeometry(UNIVERSE_RADIUS * 0.72, 0.62, 8, 160), ringMaterial.clone());
  tilted.rotation.x = Math.PI * 0.19;
  tilted.rotation.y = Math.PI * 0.34;
  tilted.material.color = new THREE.Color("#fff2bf");
  tilted.material.opacity = 0.08;
  group.add(tilted);

  return group;
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
    state.panVelocity.multiplyScalar(0.88);
  }
  if (Math.abs(state.dollyVelocity) > 0.001) {
    applyDolly(state, state.dollyVelocity);
    state.dollyVelocity *= 0.86;
  }
  state.target.lerp(state.desiredTarget, 0.12);
  state.camera.position.lerp(state.desiredPosition, 0.12);
  state.camera.lookAt(state.target);
}

function updateObserverOrbit(state: SceneRefs) {
  if (Math.abs(state.rotationVelocity.x) <= 0.00001 && Math.abs(state.rotationVelocity.y) <= 0.00001) return;
  const offset = state.desiredPosition.clone().sub(state.desiredTarget);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta -= state.rotationVelocity.x;
  spherical.phi = clamp(spherical.phi - state.rotationVelocity.y, 0.18, Math.PI - 0.18);
  offset.setFromSpherical(spherical);
  state.desiredPosition.copy(state.desiredTarget).add(offset);
  state.rotationVelocity.multiplyScalar(0.9);
}

function orbitObserver(state: SceneRefs, dx: number, dy: number) {
  state.rotationVelocity.x += dx * 0.00105;
  state.rotationVelocity.y += dy * 0.00088;
  state.rotationVelocity.multiplyScalar(0.82);
}

function trackpadGlideObserver(state: SceneRefs, deltaX: number, deltaY: number) {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (absX > 0.2) {
    const orbitImpulse = clamp(absX * 0.00042, 0.00004, 0.032) * Math.sign(deltaX);
    state.rotationVelocity.x += orbitImpulse;
  }
  if (absY > 0.2) {
    const dollyImpulse = clamp(absY * 0.18, 1.8, 48) * Math.sign(deltaY);
    state.dollyVelocity = state.dollyVelocity * 0.62 + dollyImpulse;
  }
}

function pinchZoomObserver(state: SceneRefs, deltaY: number) {
  const impulse = clamp(Math.abs(deltaY) * 0.36, 2.4, 72) * Math.sign(deltaY);
  state.dollyVelocity = state.dollyVelocity * 0.48 + impulse;
}

function panObserver(state: SceneRefs, dx: number, dy: number) {
  const distance = state.desiredPosition.distanceTo(state.desiredTarget);
  const scale = clamp(distance / 860, 0.22, 1.55);
  const forward = state.desiredTarget.clone().sub(state.desiredPosition).normalize();
  const right = new THREE.Vector3().crossVectors(forward, state.camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const movement = right.multiplyScalar(-dx * scale * 0.62).add(up.multiplyScalar(dy * scale * 0.62));
  state.panVelocity.add(movement);
  state.panVelocity.multiplyScalar(0.82);
}

function applyDolly(state: SceneRefs, amount: number) {
  const forward = state.desiredTarget.clone().sub(state.desiredPosition).normalize();
  const distance = state.desiredPosition.distanceTo(state.desiredTarget);
  const nextDistance = clamp(distance + amount, CAMERA_NEAR_DISTANCE, CAMERA_FAR_DISTANCE);
  const change = nextDistance - distance;
  state.desiredPosition.add(forward.multiplyScalar(-change));
  if (nextDistance > 980) {
    const overview = new THREE.Vector3(0, 0, 0);
    const amountToCenter = Math.min(1, (nextDistance - 980) / 360);
    const shift = overview.sub(state.desiredTarget).multiplyScalar(amountToCenter * 0.5);
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
  if (currentDirection.lengthSq() < 1) currentDirection.set(0, 80, 520);
  currentDirection.normalize();
  state.desiredTarget.copy(position);
  const distance = position.lengthSq() < 1 ? 1220 : 430;
  state.desiredPosition.copy(position).add(currentDirection.multiplyScalar(distance));
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
