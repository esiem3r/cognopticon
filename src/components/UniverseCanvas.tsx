import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  FogExp2,
  Group,
  Line,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  QuadraticBezierCurve3,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Spherical,
  Sprite,
  SpriteMaterial,
  Texture,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer
} from "three";
import { domainColors } from "../lib/domain";
import type { CognopticonNode } from "../model/cognopticonNode";
import type { ProjectDossier, ProjectRelationship } from "../types/cognopticon";

const UNIVERSE_RADIUS = 500;
const CAMERA_NEAR_DISTANCE = 300;
const CAMERA_FAR_DISTANCE = 1450;

interface UniverseCanvasProps {
  projects: ProjectDossier[];
  nodes: CognopticonNode[];
  relationships: ProjectRelationship[];
  selectedId: string;
  hoveredId: string | null;
  filteredIds: Set<string>;
  onSelect: (projectId: string) => void;
  onHover: (projectId: string | null) => void;
  onScreenNodes?: (nodes: ProjectLabel[]) => void;
  command?: GraphCommand | null;
  labelsSuppressed?: boolean;
}

export interface ProjectLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  visible: boolean;
  active: boolean;
  readiness: number;
  anomaly: number;
  launchable: boolean;
}

export interface GraphCommand {
  type: "fit" | "recenter";
  nonce: number;
}

interface SceneRefs {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  graphGroup: Group;
  projectGroup: Group;
  linkGroup: Group;
  starField: Points;
  raycaster: Raycaster;
  pointer: Vector2;
  projectMeshes: Map<string, Object3D>;
  target: Vector3;
  desiredTarget: Vector3;
  desiredPosition: Vector3;
  panVelocity: Vector3;
  dollyVelocity: number;
  rotationVelocity: Vector2;
  reducedMotion: boolean;
}

interface OverlayZone {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function UniverseCanvas({
  projects,
  nodes,
  relationships,
  selectedId,
  hoveredId,
  filteredIds,
  onSelect,
  onHover,
  onScreenNodes,
  command,
  labelsSuppressed = false
}: UniverseCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<SceneRefs | null>(null);
  const lastFlownSelectionRef = useRef<string | null>(null);
  const lastPublishedHoverRef = useRef<string | null>(null);
  const lastLabelsSignatureRef = useRef<string>("");
  const [labels, setLabels] = useState<ProjectLabel[]>([]);

  const projectPositions = useMemo(() => {
    return layoutProjectSphere(projects, relationships);
  }, [projects, relationships]);
  const keyboardProjectIds = useMemo(() => projects
    .filter((project) => filteredIds.has(project.id) && !isCoreNode(project.id))
    .map((project) => project.id), [filteredIds, projects]);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const latestRef = useRef({ projects, projectPositions, selectedId, hoveredId, onSelect, onHover, onScreenNodes, nodeById, keyboardProjectIds });
  latestRef.current = { projects, projectPositions, selectedId, hoveredId, onSelect, onHover, onScreenNodes, nodeById, keyboardProjectIds };
  const keyboardStatus = keyboardStatusText(projects, keyboardProjectIds, selectedId);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new Scene();
    scene.background = new Color("#020407");
    scene.fog = new FogExp2("#020407", 0.0018);

    const camera = new PerspectiveCamera(48, 1, 1, 3800);
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const initialReducedMotion = Boolean(motionQuery?.matches);
    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: isCanvasCaptureEnabled()
    });
    renderer.setPixelRatio(canvasPixelRatio(latestRef.current.projects.length));
    renderer.domElement.className = "universe-canvas";
    renderer.domElement.dataset.testid = "universe-canvas";
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", "Spatial project universe");
    renderer.domElement.setAttribute("aria-describedby", "graph-keyboard-help graph-keyboard-status");
    renderer.domElement.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown Home End");
    renderer.domElement.dataset.reducedMotion = String(initialReducedMotion);
    mount.appendChild(renderer.domElement);

    const graphGroup = new Group();
    const projectGroup = new Group();
    const linkGroup = new Group();
    const starField = createStarField();
    scene.add(createNebulaShell());
    graphGroup.add(createBoundarySphere());
    graphGroup.add(createLatentCloud());
    scene.add(starField);
    graphGroup.add(linkGroup);
    graphGroup.add(projectGroup);
    scene.add(graphGroup);
    scene.add(new AmbientLight("#c3efff", 1.1));

    const keyLight = new PointLight("#fff2bf", 1400, 3200);
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
      raycaster: new Raycaster(),
      pointer: new Vector2(),
      projectMeshes: new Map(),
      target: new Vector3(0, 0, 0),
      desiredTarget: new Vector3(0, 0, 0),
      desiredPosition: new Vector3(0, 0, 1220),
      panVelocity: new Vector3(),
      dollyVelocity: 0,
      rotationVelocity: new Vector2(),
      reducedMotion: initialReducedMotion
    };
    camera.position.copy(refs.current.desiredPosition);

    const applyReducedMotionPreference = (matches: boolean) => {
      const state = refs.current;
      if (!state) return;
      state.reducedMotion = matches;
      state.renderer.domElement.dataset.reducedMotion = String(matches);
      if (matches) {
        state.panVelocity.set(0, 0, 0);
        state.dollyVelocity = 0;
        state.rotationVelocity.set(0, 0);
        snapCameraToDesired(state);
      }
    };

    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      applyReducedMotionPreference(event.matches);
    };
    if (motionQuery) {
      if (typeof motionQuery.addEventListener === "function") {
        motionQuery.addEventListener("change", handleReducedMotionChange);
      } else {
        motionQuery.addListener?.(handleReducedMotionChange);
      }
    }

    let pointerActive = false;
    let movedDuringDrag = false;
    let lastX = 0;
    let lastY = 0;

    const publishHover = (projectId: string | null) => {
      if (lastPublishedHoverRef.current === projectId) return;
      lastPublishedHoverRef.current = projectId;
      latestRef.current.onHover(projectId);
    };

    const handlePointerDown = (event: PointerEvent) => {
      renderer.domElement.focus({ preventScroll: true });
      pointerActive = true;
      movedDuringDrag = false;
      lastX = event.clientX;
      lastY = event.clientY;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = refs.current;
      if (!state) return;
      if (!pointerActive) {
        const hitId = pickProjectFromState(state, event.clientX, event.clientY);
        renderer.domElement.classList.toggle("is-hovering-node", Boolean(hitId));
        publishHover(hitId ?? null);
        return;
      }
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
      pointerActive = false;
      const hitId = pickProjectFromState(state, event.clientX, event.clientY);
      if (hitId && !movedDuringDrag) latestRef.current.onSelect(hitId);
    };

    const handlePointerLeave = () => {
      renderer.domElement.classList.remove("is-hovering-node");
      publishHover(null);
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

    const handleKeyDown = (event: KeyboardEvent) => {
      const nextProjectId = keyboardTargetForKey(event.key, latestRef.current.keyboardProjectIds, latestRef.current.selectedId);
      if (!nextProjectId) return;
      event.preventDefault();
      event.stopPropagation();
      latestRef.current.onSelect(nextProjectId);
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });
    renderer.domElement.addEventListener("keydown", handleKeyDown);

    const observer = new ResizeObserver(() => resize());
    observer.observe(mount);
    resize();

    let frame = 0;
    let labelTick = 0;
    const animate = (time: number) => {
      const state = refs.current;
      if (!state) return;
      if (!state.reducedMotion) {
        state.starField.rotation.y = time * 0.000025;
        state.projectGroup.children.forEach((child) => {
          const spin = child.userData.spin as { x: number; y: number; z: number } | undefined;
          child.rotation.x += spin?.x ?? 0.002;
          child.rotation.y += spin?.y ?? 0.006;
          child.rotation.z += spin?.z ?? 0;
        });
      }
      updateObserverOrbit(state);
      updateCamera(state);
      state.renderer.render(state.scene, state.camera);
      labelTick += 1;
      if (labelTick % 18 === 0) updateLabels(state);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    function resize() {
      const state = refs.current;
      if (!state || !mount) return;
      const rect = mount.getBoundingClientRect();
      state.camera.aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
      state.camera.updateProjectionMatrix();
      state.renderer.setPixelRatio(canvasPixelRatio(latestRef.current.projects.length));
      state.renderer.setSize(Math.max(rect.width, 1), Math.max(rect.height, 1), false);
    }

    function updateLabels(state: SceneRefs) {
      const rect = state.renderer.domElement.getBoundingClientRect();
      const latest = latestRef.current;
      const currentMount = mountRef.current;
      const overlayZones = currentMount ? mobileOverlayControlZones(currentMount, rect) : [];
      const projectedLabels = latest.projects.map((project, index) => {
        const position = latest.projectPositions.get(project.id) ?? projectVector(project, index);
        const worldPosition = position.clone().applyMatrix4(state.graphGroup.matrixWorld);
        const projected = worldPosition.clone().project(state.camera);
        const active = project.id === latest.selectedId || project.id === latest.hoveredId;
        const node = latest.nodeById.get(project.id);
        const centerNode = isCoreNode(project.id);
        const nearCamera = state.camera.position.distanceTo(worldPosition) < 1280;
        const rawX = (projected.x * 0.5 + 0.5) * rect.width;
        const rawY = (-projected.y * 0.5 + 0.5) * rect.height;
        const labelWidth = rect.width < 520 ? 132 : 190;
        const labelPosition = avoidMobileOverlayControls(
          clamp(rawX, 12, Math.max(12, rect.width - labelWidth - 12)),
          clamp(rawY, 34, Math.max(34, rect.height - 18)),
          labelWidth,
          rect.width,
          rect.height,
          overlayZones
        );
        const baseVisible = !centerNode && projected.z < 1 && (active || nearCamera);
        return {
          id: project.id,
          name: project.name,
          x: labelPosition.x,
          y: labelPosition.y,
          visible: baseVisible && !labelPosition.occluded,
          active,
          readiness: node?.state.readiness ?? 0,
          anomaly: node?.visual.anomalyIntensity ?? 0,
          launchable: Boolean(node?.launch)
        };
      });
      const next = declutterMobileLabels(projectedLabels, rect.width);
      const signature = labelSignature(next);
      if (signature === lastLabelsSignatureRef.current) return;
      lastLabelsSignatureRef.current = signature;
      setLabels(next);
      latest.onScreenNodes?.(next);
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
      renderer.domElement.removeEventListener("keydown", handleKeyDown);
      if (motionQuery) {
        if (typeof motionQuery.removeEventListener === "function") {
          motionQuery.removeEventListener("change", handleReducedMotionChange);
        } else {
          motionQuery.removeListener?.(handleReducedMotionChange);
        }
      }
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
      const active = project.id === selectedId;
      const mesh = createProjectBody(project, nodeById.get(project.id), visible, active);
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
      const active =
        relationship.source === selectedId ||
        relationship.target === selectedId;
      const sourceProject = projects.find((project) => project.id === relationship.source);
      const targetProject = projects.find((project) => project.id === relationship.target);
      state.linkGroup.add(createRelationshipFilament(
        source,
        target,
        relationship,
        sourceVisible && targetVisible,
        active,
        nodeVisualRadius(sourceProject),
        nodeVisualRadius(targetProject)
      ));
    }

  }, [filteredIds, nodeById, projectPositions, projects, relationships, selectedId]);

  useEffect(() => {
    const state = refs.current;
    const selectedPosition = projectPositions.get(selectedId);
    if (!state || !selectedPosition || !filteredIds.has(selectedId)) return;
    if (lastFlownSelectionRef.current === selectedId) return;
    flyToProject(state, selectedPosition);
    lastFlownSelectionRef.current = selectedId;
  }, [filteredIds, projectPositions, selectedId]);

  useEffect(() => {
    const state = refs.current;
    if (!state || !command) return;
    if (command.type === "fit") {
      resetUniverseView(state);
      lastFlownSelectionRef.current = null;
      return;
    }
    const selectedPosition = projectPositions.get(selectedId);
    if (selectedPosition) {
      flyToProject(state, selectedPosition);
      lastFlownSelectionRef.current = selectedId;
    }
  }, [command, projectPositions, selectedId]);

  return (
    <div ref={mountRef} className="universe-frame three-universe">
      <p id="graph-keyboard-help" className="sr-only">Use arrow keys to move between visible projects. Home and End jump to the first and last visible project.</p>
      <div id="graph-keyboard-status" className="sr-only" role="status" aria-label="Graph keyboard status" aria-live="polite">
        {keyboardStatus}
      </div>
      <div className="latent-haze" aria-hidden />
      <div className="project-label-layer" data-suppressed={labelsSuppressed} aria-hidden>
        {!labelsSuppressed && labels.filter((label) => !isCoreNode(label.id)).map((label) => (
          <span
            key={label.id}
            className={[
              "project-label",
              label.active ? "active" : "",
              label.launchable ? "launchable" : "",
              label.anomaly > 0.55 ? "anomalous" : ""
            ].filter(Boolean).join(" ")}
            data-readiness={label.readiness}
            style={{ transform: `translate3d(${label.x}px, ${label.y}px, 0)`, opacity: label.visible ? 1 : 0 }}
          >
            {label.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function keyboardTargetForKey(key: string, projectIds: string[], selectedId: string) {
  if (!projectIds.length) return undefined;
  const currentIndex = projectIds.indexOf(selectedId);
  if (key === "Home") return projectIds[0];
  if (key === "End") return projectIds[projectIds.length - 1];
  if (key === "ArrowRight" || key === "ArrowDown") {
    const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
    return projectIds[nextIndex % projectIds.length];
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    const previousIndex = currentIndex >= 0 ? currentIndex - 1 : projectIds.length - 1;
    return projectIds[(previousIndex + projectIds.length) % projectIds.length];
  }
  return undefined;
}

function keyboardStatusText(projects: ProjectDossier[], keyboardProjectIds: string[], selectedId: string) {
  const selected = projects.find((project) => project.id === selectedId);
  const selectedName = selected?.name ?? "No project";
  const index = keyboardProjectIds.indexOf(selectedId);
  if (index < 0) return `Selected ${selectedName}. ${keyboardProjectIds.length} visible projects available.`;
  return `Selected ${selectedName}. ${index + 1} of ${keyboardProjectIds.length} visible projects.`;
}

function layoutProjectSphere(projects: ProjectDossier[], relationships: ProjectRelationship[]) {
  const positions = new Map<string, Vector3>();
  const nonCore = projects.filter((project) => !isCoreNode(project.id));
  const communities = communityOrder(nonCore, relationships);
  const communityAngles = new Map<string, number>();
  communities.forEach((community, index) => {
    communityAngles.set(community, (index / Math.max(communities.length, 1)) * Math.PI * 2);
  });

  for (const project of projects) {
    if (isCoreNode(project.id)) {
      positions.set(project.id, new Vector3(0, 0, 0));
      continue;
    }
    const community = project.domain;
    const communityIndex = nonCore.filter((item) => item.domain === community).findIndex((item) => item.id === project.id);
    const baseAngle = communityAngles.get(community) ?? hashAngle(project.domain);
    const hash = stableHash(project.id);
    const relationshipPull = relationshipVector(project, relationships, projects);
    const shell = 0.44 + project.substance * 0.28 + project.activity * 0.16;
    const urgencyPull = project.decision === "build" ? -38 : project.decision === "triage" ? -12 : 26;
    const radius = clamp(shell * UNIVERSE_RADIUS + urgencyPull, 250, UNIVERSE_RADIUS - 48);
    const theta = baseAngle + communityIndex * 0.28 + Math.sin(hash * 0.013) * 0.19 + relationshipPull.x;
    const phi = 0.54 + ((communityIndex * 0.58 + (hash % 37) / 37) % 2.12) + relationshipPull.y;
    positions.set(project.id, new Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    ));
  }

  return positions;
}

function projectVector(project: ProjectDossier, index: number) {
  if (isCoreNode(project.id)) return new Vector3(0, 0, 0);

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
  return new Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function communityOrder(projects: ProjectDossier[], relationships: ProjectRelationship[]) {
  const strengths = new Map<string, number>();
  for (const project of projects) strengths.set(project.domain, strengths.get(project.domain) ?? 0);
  for (const relationship of relationships) {
    const source = projects.find((project) => project.id === relationship.source);
    const target = projects.find((project) => project.id === relationship.target);
    if (!source || !target) continue;
    strengths.set(source.domain, (strengths.get(source.domain) ?? 0) + relationship.strength);
    strengths.set(target.domain, (strengths.get(target.domain) ?? 0) + relationship.strength);
  }
  return [...strengths.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([domain]) => domain);
}

function relationshipVector(project: ProjectDossier, relationships: ProjectRelationship[], projects: ProjectDossier[]) {
  const byId = new Map(projects.map((item) => [item.id, item]));
  const related = relationships.filter((relationship) => relationship.source === project.id || relationship.target === project.id);
  if (!related.length) return new Vector2(0, 0);
  let thetaPull = 0;
  let phiPull = 0;
  for (const relationship of related) {
    const otherId = relationship.source === project.id ? relationship.target : relationship.source;
    const other = byId.get(otherId);
    if (!other || isCoreNode(other.id)) continue;
    thetaPull += Math.sin(hashAngle(other.domain) - hashAngle(project.domain)) * relationship.strength * 0.11;
    phiPull += (other.activity - project.activity) * relationship.strength * 0.08;
  }
  return new Vector2(clamp(thetaPull, -0.24, 0.24), clamp(phiPull, -0.16, 0.16));
}

function hashAngle(value: string) {
  return ((stableHash(value) % 1000) / 1000) * Math.PI * 2;
}

function isCoreNode(id: string) {
  return id === "cognopticon" || id === "workspace-core";
}

function isCanvasCaptureEnabled() {
  const meta = import.meta as ImportMeta & { env?: { MODE?: string } };
  return navigator.webdriver || meta.env?.MODE === "test" || new URLSearchParams(window.location.search).has("captureCanvas");
}

function canvasPixelRatio(projectCount: number) {
  const deviceRatio = window.devicePixelRatio || 1;
  const cap = projectCount > 96 ? 1.15 : projectCount > 64 ? 1.35 : 1.75;
  return Math.min(deviceRatio, cap);
}

function labelSignature(labels: ProjectLabel[]) {
  return labels
    .filter((label) => label.visible || label.active)
    .map((label) => `${label.id}:${Math.round(label.x)}:${Math.round(label.y)}:${label.visible ? 1 : 0}:${label.active ? 1 : 0}`)
    .join("|");
}

function createProjectBody(project: ProjectDossier, node: CognopticonNode | undefined, visible: boolean, active: boolean) {
  const color = new Color(domainColors[project.domain]);
  const warm = new Color("#fff2bf");
  const isCenter = isCoreNode(project.id);
  const radius = nodeVisualRadius(project);
  const seed = stableHash(project.id);
  const readiness = node?.state.readiness ?? estimateReadiness(project);
  const anomaly = node?.visual.anomalyIntensity ?? 0;
  const launchable = Boolean(node?.launch);
  const readinessColor = readiness >= 84 ? new Color("#65ffb1") : readiness >= 68 ? new Color("#ffd166") : readiness >= 42 ? new Color("#ff9f6e") : new Color("#ff4d9d");
  const group = new Group();
  group.userData.projectId = project.id;
  group.userData.spin = {
    x: (0.0008 + ((seed % 11) / 11) * 0.0022) * (seed % 2 === 0 ? 1 : -1),
    y: (0.0024 + ((seed % 17) / 17) * 0.0052) * (seed % 3 === 0 ? -1 : 1),
    z: (0.0003 + ((seed % 7) / 7) * 0.0016) * (seed % 5 === 0 ? -1 : 1)
  };

  const sphere = new Mesh(
    new SphereGeometry(radius, 32, 20),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: visible ? 0.74 + readiness / 520 : 0.18,
      blending: AdditiveBlending
    })
  );
  sphere.userData.projectId = project.id;
  group.add(sphere);

  const innerCore = new Mesh(
    new SphereGeometry(radius * 0.46, 20, 14),
    new MeshBasicMaterial({
      color: color.clone().lerp(new Color("#ffffff"), active ? 0.72 : 0.52),
      transparent: true,
      opacity: active ? 0.96 : visible ? 0.78 : 0.12,
      blending: AdditiveBlending,
      depthWrite: false
    })
  );
  innerCore.userData.projectId = project.id;
  group.add(innerCore);

  const fresnel = new Mesh(
    new SphereGeometry(radius * 1.06, 32, 20),
    new ShaderMaterial({
      uniforms: {
        glowColor: { value: active ? warm : color },
        opacity: { value: active ? 0.95 : visible ? 0.38 + readiness / 260 : 0.12 }
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
      blending: AdditiveBlending,
      depthWrite: false
    })
  );
  fresnel.userData.projectId = project.id;
  group.add(fresnel);

  const sprite = new Sprite(
    new SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity: active ? 0.86 : visible ? 0.52 : 0.14,
      blending: AdditiveBlending,
      depthWrite: false
    })
  );
  const spriteScale = radius * (active ? 5.1 : visible ? 4.1 : 2.2);
  sprite.scale.set(spriteScale, spriteScale, 1);
  sprite.userData.projectId = project.id;
  group.add(sprite);

  const coreLight = new Sprite(
    new SpriteMaterial({
      map: glowTexture(),
      color: active ? "#fff2bf" : "#ffffff",
      transparent: true,
      opacity: active ? 0.5 : visible ? 0.28 : 0.05,
      blending: AdditiveBlending,
      depthWrite: false
    })
  );
  coreLight.scale.set(radius * 1.4, radius * 1.4, 1);
  coreLight.position.set(-radius * 0.22, radius * 0.18, radius * 0.5);
  coreLight.userData.projectId = project.id;
  group.add(coreLight);

  const ring = new Mesh(
    new TorusGeometry(radius * (isCenter ? 2.15 : 1.85), Math.max(0.5, radius * 0.018), 6, 72),
    new MeshBasicMaterial({
      color: active ? "#fff2bf" : color,
      transparent: true,
      opacity: active || isCenter ? 0.62 : visible ? 0.1 : 0.025,
      blending: AdditiveBlending,
      depthWrite: false
    })
  );
  ring.rotation.x = Math.PI * (0.22 + ((seed % 41) / 41) * 0.62);
  ring.rotation.y = Math.PI * (0.08 + ((seed % 29) / 29) * 0.48);
  ring.rotation.z = Math.PI * (((seed % 23) / 23) * 0.36);
  group.add(ring);

  const readinessRing = new Mesh(
    new TorusGeometry(radius * 2.34, Math.max(0.7, radius * 0.032), 8, 96),
    new MeshBasicMaterial({
      color: readinessColor,
      transparent: true,
      opacity: visible ? 0.14 + (readiness / 100) * 0.36 : 0.025,
      blending: AdditiveBlending,
      depthWrite: false
    })
  );
  readinessRing.rotation.x = Math.PI * 0.5;
  readinessRing.rotation.z = Math.PI * (((100 - readiness) / 100) * 0.4);
  readinessRing.scale.setScalar(0.62 + readiness / 220);
  group.add(readinessRing);

  if (anomaly > 0.18) {
    const shard = new Mesh(
      new OctahedronGeometry(radius * (0.34 + anomaly * 0.5), 0),
      new MeshBasicMaterial({
        color: anomaly > 0.58 ? "#ff4d9d" : "#ffd166",
        transparent: true,
        opacity: visible ? 0.38 + anomaly * 0.44 : 0.08,
        blending: AdditiveBlending,
        depthWrite: false
      })
    );
    shard.position.set(radius * 1.12, radius * 1.08, radius * 0.34);
    shard.userData.projectId = project.id;
    group.add(shard);
  }

  if (launchable) {
    const beacon = new Mesh(
      new ConeGeometry(radius * 0.28, radius * 0.86, 4),
      new MeshBasicMaterial({
        color: "#fff2bf",
        transparent: true,
        opacity: visible ? 0.82 : 0.1,
        blending: AdditiveBlending,
        depthWrite: false
      })
    );
    beacon.position.set(-radius * 0.42, radius * 1.72, radius * 0.2);
    beacon.rotation.z = Math.PI * 0.25;
    beacon.userData.projectId = project.id;
    group.add(beacon);
  }

  const polarRing = new Mesh(
    new TorusGeometry(radius * (isCenter ? 1.58 : 1.38), Math.max(0.38, radius * 0.012), 6, 72),
    new MeshBasicMaterial({
      color: active ? "#ffffff" : color,
      transparent: true,
      opacity: active || isCenter ? 0.34 : visible ? 0.045 : 0.015,
      blending: AdditiveBlending,
      depthWrite: false
    })
  );
  polarRing.rotation.x = Math.PI * (0.04 + ((seed % 31) / 31) * 0.4);
  polarRing.rotation.y = Math.PI * (0.38 + ((seed % 37) / 37) * 0.56);
  polarRing.rotation.z = Math.PI * (0.1 + ((seed % 19) / 19) * 0.52);
  group.add(polarRing);

  return group;
}

function createRelationshipFilament(
  source: Vector3,
  target: Vector3,
  relationship: ProjectRelationship,
  visible: boolean,
  active: boolean,
  sourceRadius: number,
  targetRadius: number
) {
  const direction = target.clone().sub(source);
  const distance = direction.length();
  if (distance < 1) return new Group();
  direction.normalize();
  const start = source.clone().add(direction.clone().multiplyScalar(sourceRadius * 1.55));
  const end = target.clone().add(direction.clone().multiplyScalar(-targetRadius * 1.55));
  const middle = start.clone().lerp(end, 0.5);
  const outward = middle.lengthSq() > 1 ? middle.clone().normalize() : new Vector3(0, 1, 0);
  middle.add(outward.multiplyScalar(42 + relationship.strength * 94));
  const curve = new QuadraticBezierCurve3(start, middle, end);
  const points = curve.getPoints(34);
  const alpha = new Float32Array(points.length);
  for (let index = 0; index < points.length; index += 1) {
    const t = index / (points.length - 1);
    const endFade = Math.min(1, Math.min(t, 1 - t) / 0.22);
    alpha[index] = Math.pow(endFade, 1.45);
  }
  const geometry = new BufferGeometry().setFromPoints(points);
  geometry.setAttribute("lineAlpha", new BufferAttribute(alpha, 1));
  const material = new ShaderMaterial({
    uniforms: {
      color: { value: new Color(active ? "#fff0b8" : relationshipColor(relationship)) },
      opacity: { value: active ? 0.76 : visible ? 0.32 : 0.06 }
    },
    vertexShader: `
      attribute float lineAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = lineAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(color, opacity * vAlpha);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false
  });
  return new Line(geometry, material);
}

function nodeVisualRadius(project?: ProjectDossier) {
  if (!project) return 18;
  return project.id === "cognopticon" ? 31 : 8 + project.substance * 12;
}

function relationshipColor(relationship: ProjectRelationship) {
  if (relationship.kind === "supersedes") return "#ff79c9";
  if (relationship.kind === "agent_target") return "#ffd166";
  if (relationship.kind === "archive_source") return "#d5c6ff";
  if (relationship.kind === "depends_on") return "#7bdcff";
  if (relationship.kind === "reference") return "#80e4c9";
  return relationship.strength > 0.72 ? "#65ffb1" : "#9bd6e2";
}

function estimateReadiness(project: ProjectDossier) {
  const evidenceText = project.evidence.map((item) => `${item.label} ${item.path}`).join(" ").toLowerCase();
  let score = 20 + project.activity * 18 + project.substance * 18;
  if (/readme/.test(evidenceText)) score += 12;
  if (/package\.json|pyproject|cargo\.toml|go\.mod|vite|tsconfig/.test(evidenceText)) score += 14;
  if (/test|spec|playwright|vitest|pytest/.test(evidenceText)) score += 16;
  if (project.tags.some((tag) => tag.includes("launch"))) score += 14;
  if (project.health === "fragile" || project.health === "stalled") score -= 12;
  return clamp(Math.round(score), 0, 100);
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }
  return Math.abs(hash);
}

function createBoundarySphere() {
  const group = new Group();

  const shell = new Mesh(
    new SphereGeometry(UNIVERSE_RADIUS, 64, 32),
    new MeshBasicMaterial({
      color: "#74d8ff",
      transparent: true,
      opacity: 0.028,
      wireframe: true,
      blending: AdditiveBlending,
      depthWrite: false
    })
  );
  group.add(shell);

  const ringMaterial = new MeshBasicMaterial({
    color: "#f98ad4",
    transparent: true,
    opacity: 0.12,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const equator = new Mesh(new TorusGeometry(UNIVERSE_RADIUS, 0.9, 6, 128), ringMaterial.clone());
  equator.rotation.x = Math.PI / 2;
  group.add(equator);

  const meridian = new Mesh(new TorusGeometry(UNIVERSE_RADIUS, 0.72, 6, 128), ringMaterial.clone());
  meridian.rotation.y = Math.PI / 2;
  meridian.material.color = new Color("#80e4c9");
  meridian.material.opacity = 0.095;
  group.add(meridian);

  const tilted = new Mesh(new TorusGeometry(UNIVERSE_RADIUS * 0.72, 0.62, 6, 96), ringMaterial.clone());
  tilted.rotation.x = Math.PI * 0.19;
  tilted.rotation.y = Math.PI * 0.34;
  tilted.material.color = new Color("#fff2bf");
  tilted.material.opacity = 0.08;
  group.add(tilted);

  return group;
}

function createStarField() {
  const count = 1200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = 420 + Math.random() * 1500;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(MathUtils.randFloatSpread(2));
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[index * 3 + 2] = radius * Math.cos(phi);
    const tint = new Color(index % 7 === 0 ? "#ffe9a6" : index % 5 === 0 ? "#f59bd8" : "#9fd7ff");
    colors[index * 3] = tint.r;
    colors[index * 3 + 1] = tint.g;
    colors[index * 3 + 2] = tint.b;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return new Points(
    geometry,
    new PointsMaterial({
      size: 3.8,
      map: pointTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: AdditiveBlending
    })
  );
}

function createNebulaShell() {
  const geometry = new SphereGeometry(1800, 40, 20);
  const material = new MeshBasicMaterial({
    color: "#334566",
    transparent: true,
    opacity: 0.18,
    side: BackSide,
    blending: AdditiveBlending,
    depthWrite: false
  });
  return new Mesh(geometry, material);
}

function createLatentCloud() {
  const count = 180;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = index * 0.29;
    const radius = 80 + index * 2.2;
    positions[index * 3] = Math.cos(angle) * radius + MathUtils.randFloatSpread(120);
    positions[index * 3 + 1] = Math.sin(angle * 0.72) * 180 + MathUtils.randFloatSpread(140);
    positions[index * 3 + 2] = Math.sin(angle) * radius * 0.75 + MathUtils.randFloatSpread(180);
    const tint = new Color(index % 3 === 0 ? "#f98ad4" : index % 3 === 1 ? "#80e4c9" : "#81d4ff");
    colors[index * 3] = tint.r;
    colors[index * 3 + 1] = tint.g;
    colors[index * 3 + 2] = tint.b;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return new Points(
    geometry,
    new PointsMaterial({
      size: 12,
      map: pointTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: AdditiveBlending
    })
  );
}

let cachedGlowTexture: Texture | null = null;
let cachedPointTexture: Texture | null = null;

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
  cachedGlowTexture = new CanvasTexture(canvas);
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
  cachedPointTexture = new CanvasTexture(canvas);
  return cachedPointTexture;
}

function updateCamera(state: SceneRefs) {
  if (state.panVelocity.lengthSq() > 0.0001) {
    state.desiredPosition.add(state.panVelocity);
    state.desiredTarget.add(state.panVelocity);
    if (state.reducedMotion) state.panVelocity.set(0, 0, 0);
    else state.panVelocity.multiplyScalar(0.92);
  }
  if (Math.abs(state.dollyVelocity) > 0.001) {
    applyDolly(state, state.dollyVelocity);
    if (state.reducedMotion) state.dollyVelocity = 0;
    else state.dollyVelocity *= 0.9;
  }
  if (state.reducedMotion) {
    snapCameraToDesired(state);
    return;
  }
  state.target.lerp(state.desiredTarget, 0.095);
  state.camera.position.lerp(state.desiredPosition, 0.095);
  state.camera.lookAt(state.target);
}

function updateObserverOrbit(state: SceneRefs) {
  if (Math.abs(state.rotationVelocity.x) <= 0.00001 && Math.abs(state.rotationVelocity.y) <= 0.00001) return;
  const offset = state.desiredPosition.clone().sub(state.desiredTarget);
  const spherical = new Spherical().setFromVector3(offset);
  spherical.theta -= state.rotationVelocity.x;
  spherical.phi = clamp(spherical.phi - state.rotationVelocity.y, 0.18, Math.PI - 0.18);
  offset.setFromSpherical(spherical);
  state.desiredPosition.copy(state.desiredTarget).add(offset);
  if (state.reducedMotion) state.rotationVelocity.set(0, 0);
  else state.rotationVelocity.multiplyScalar(0.93);
}

function orbitObserver(state: SceneRefs, dx: number, dy: number) {
  state.rotationVelocity.x += dx * 0.00115;
  state.rotationVelocity.y += dy * 0.00096;
  state.rotationVelocity.multiplyScalar(0.88);
}

function trackpadGlideObserver(state: SceneRefs, deltaX: number, deltaY: number) {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (absX > 0.2) {
    const orbitImpulse = clamp(absX * 0.0005, 0.00004, 0.04) * Math.sign(deltaX);
    state.rotationVelocity.x += orbitImpulse;
  }
  if (absY > 0.2) {
    const dollyImpulse = clamp(absY * 0.2, 1.8, 54) * Math.sign(deltaY);
    state.dollyVelocity = state.dollyVelocity * 0.68 + dollyImpulse;
  }
}

function pinchZoomObserver(state: SceneRefs, deltaY: number) {
  const impulse = clamp(Math.abs(deltaY) * 0.4, 2.4, 80) * Math.sign(deltaY);
  state.dollyVelocity = state.dollyVelocity * 0.56 + impulse;
}

function panObserver(state: SceneRefs, dx: number, dy: number) {
  const distance = state.desiredPosition.distanceTo(state.desiredTarget);
  const scale = clamp(distance / 860, 0.22, 1.55);
  const forward = state.desiredTarget.clone().sub(state.desiredPosition).normalize();
  const right = new Vector3().crossVectors(forward, state.camera.up).normalize();
  const up = new Vector3().crossVectors(right, forward).normalize();
  const movement = right.multiplyScalar(-dx * scale * 0.62).add(up.multiplyScalar(dy * scale * 0.62));
  state.panVelocity.add(movement);
  state.panVelocity.multiplyScalar(0.88);
}

function applyDolly(state: SceneRefs, amount: number) {
  const forward = state.desiredTarget.clone().sub(state.desiredPosition).normalize();
  const distance = state.desiredPosition.distanceTo(state.desiredTarget);
  const nextDistance = clamp(distance + amount, CAMERA_NEAR_DISTANCE, CAMERA_FAR_DISTANCE);
  const change = nextDistance - distance;
  state.desiredPosition.add(forward.multiplyScalar(-change));
  if (nextDistance > 980) {
    const overview = new Vector3(0, 0, 0);
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

function flyToProject(state: SceneRefs, position: Vector3) {
  const currentDirection = state.desiredPosition.clone().sub(state.desiredTarget);
  if (currentDirection.lengthSq() < 1) currentDirection.set(0, 80, 520);
  currentDirection.normalize();
  state.desiredTarget.copy(position);
  const distance = position.lengthSq() < 1 ? 1220 : 430;
  state.desiredPosition.copy(position).add(currentDirection.multiplyScalar(distance));
  state.panVelocity.set(0, 0, 0);
  state.dollyVelocity = 0;
  state.rotationVelocity.set(0, 0);
  if (state.reducedMotion) snapCameraToDesired(state);
}

function resetUniverseView(state: SceneRefs) {
  state.desiredTarget.set(0, 0, 0);
  state.target.set(0, 0, 0);
  state.desiredPosition.set(0, 0, 1220);
  state.camera.position.set(0, 0, 1220);
  state.panVelocity.set(0, 0, 0);
  state.dollyVelocity = 0;
  state.rotationVelocity.set(0, 0);
  state.camera.lookAt(state.target);
}

function snapCameraToDesired(state: SceneRefs) {
  state.target.copy(state.desiredTarget);
  state.camera.position.copy(state.desiredPosition);
  state.camera.lookAt(state.target);
}

function disposeGroup(group: Group) {
  group.traverse((object) => disposeObject(object));
}

function disposeObject(object: Object3D) {
  const maybeMesh = object as Mesh;
  maybeMesh.geometry?.dispose();
  const material = maybeMesh.material;
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material?.dispose();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mobileOverlayControlZones(mount: HTMLElement, canvasRect: DOMRect): OverlayZone[] {
  if (canvasRect.width > 520) return [];
  const stage = mount.parentElement;
  if (!stage) return [];
  const selectors = [
    ".queue-overlay",
    ".graph-controls",
    ".filter-trigger",
    ".graph-instrument",
    ".mobile-action-dock",
    ".filter-popover",
    ".queue-popover"
  ];
  return selectors.flatMap((selector) => {
    const element = stage.querySelector(selector);
    if (!element) return [];
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return [];
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return [];
    const padding = selector === ".graph-instrument" || selector === ".mobile-action-dock" ? 10 : 8;
    return [{
      left: clamp(rect.left - canvasRect.left - padding, 0, canvasRect.width),
      right: clamp(rect.right - canvasRect.left + padding, 0, canvasRect.width),
      top: clamp(rect.top - canvasRect.top - padding, 0, canvasRect.height),
      bottom: clamp(rect.bottom - canvasRect.top + padding, 0, canvasRect.height)
    }];
  });
}

function avoidMobileOverlayControls(x: number, y: number, labelWidth: number, canvasWidth: number, canvasHeight: number, reserved: OverlayZone[]) {
  if (canvasWidth > 520 || reserved.length === 0) return { x, y, occluded: false };
  const labelHeight = 42;
  const labelBottomOffset = 16;
  const gap = 8;
  let nextY = clamp(y, labelHeight + labelBottomOffset + gap, Math.max(labelHeight + labelBottomOffset + gap, canvasHeight - 18));

  for (let attempt = 0; attempt < reserved.length + 1; attempt += 1) {
    const label = labelRect(x, nextY, labelWidth, labelHeight, labelBottomOffset);
    const collision = reserved.find((zone) => rectanglesOverlap(label, zone));
    if (!collision) return { x, y: nextY, occluded: false };
    const zoneCenterY = (collision.top + collision.bottom) / 2;
    if (zoneCenterY < canvasHeight / 2) {
      nextY = collision.bottom + labelHeight + labelBottomOffset + gap;
    } else {
      nextY = collision.top + labelBottomOffset - gap;
    }
    nextY = clamp(nextY, labelHeight + labelBottomOffset + gap, Math.max(labelHeight + labelBottomOffset + gap, canvasHeight - 18));
  }

  return { x, y: nextY, occluded: true };
}

function declutterMobileLabels(labels: ProjectLabel[], canvasWidth: number) {
  if (canvasWidth > 520) return labels;
  const accepted: Array<{ label: ProjectLabel; rect: OverlayZone }> = [];
  const visibility = new Map(labels.map((label) => [label.id, label.visible]));
  const candidates = labels
    .filter((label) => label.visible)
    .sort((a, b) => mobileLabelPriority(b) - mobileLabelPriority(a) || a.name.localeCompare(b.name));

  for (const label of candidates) {
    const rect = labelRect(label.x, label.y, 132, 42, 16);
    const padded = {
      left: rect.left - 6,
      right: rect.right + 6,
      top: rect.top - 4,
      bottom: rect.bottom + 4
    };
    const collides = accepted.some((item) => rectanglesOverlap(padded, item.rect));
    const withinBudget = accepted.length < 5 || label.active;
    visibility.set(label.id, !collides && withinBudget);
    if (!collides && withinBudget) accepted.push({ label, rect: padded });
  }

  return labels.map((label) => ({ ...label, visible: visibility.get(label.id) ?? label.visible }));
}

function mobileLabelPriority(label: ProjectLabel) {
  return (label.active ? 1000 : 0)
    + (label.launchable ? 120 : 0)
    + (label.anomaly > 0.55 ? 90 : 0)
    + Math.round(label.readiness)
    - Math.round(label.y / 10);
}

function labelRect(x: number, y: number, labelWidth: number, labelHeight: number, labelBottomOffset: number) {
  return {
    left: x - 6,
    right: x - 6 + labelWidth,
    top: y - labelHeight - labelBottomOffset,
    bottom: y - labelBottomOffset
  };
}

function rectanglesOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number }
) {
  return Math.min(a.right, b.right) > Math.max(a.left, b.left)
    && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
}
