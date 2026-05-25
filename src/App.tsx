import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Activity, ListChecks, LocateFixed, Maximize2, Search, Sparkles, X } from "lucide-react";
import { runAgencyTick } from "./agency/agencyKernel";
import type { DaemonStatus } from "./agency/types";
import { CognitionRail } from "./components/cognition/CognitionRail";
import { MissionDrawer } from "./components/MissionDrawer";
import { RunHistoryDrawer } from "./components/RunHistoryDrawer";
import { RuntimeHealthDrawer } from "./components/RuntimeHealthDrawer";
import { UniverseCanvas, type GraphCommand, type ProjectLabel } from "./components/UniverseCanvas";
import { compileMissionForProposal } from "./intelligence/missionCompiler";
import type { CognopticonEvent, InterventionProposal } from "./intelligence/types";
import { domainLabels, focusModeMatches, focusModes, generateMissionBrief, nextActionQueue, projectMatches, statusLabels, type FocusMode } from "./lib/domain";
import { loadWorkspace, sampleWorkspace } from "./lib/workspace";
import { adaptProjectDossiers } from "./model/adaptProjectDossier";
import { DetailTray } from "./overlays/DetailTray";
import { NodeCockpit } from "./overlays/NodeCockpit";
import { NodeOverlayLayer } from "./overlays/NodeOverlayLayer";
import { checkDaemonHealth, createDaemonJob, getDaemonJob, getDaemonRunState, getOrchestratorState, recordOrchestratorTaskEvent, startOrchestratorSession, subscribeDaemonEvents, type DaemonRunJob, type OrchestratorTaskEvent } from "./services/daemonClient";
import type { CognopticonWorkspace, MissionBrief, ProjectDomain, ProjectDossier, ProjectStatus, RunRecord } from "./types/cognopticon";

const projectTypeFilters = [
  { id: "ai", label: "AI", matches: (project: ProjectDossier) => project.domain === "agentics" || project.tags.some((tag) => tag.includes("agent") || tag === "models") },
  { id: "math", label: "Math", matches: (project: ProjectDossier) => project.tags.includes("math") || project.tags.includes("proof") || project.tags.includes("calculus") },
  { id: "tools", label: "Tools", matches: (project: ProjectDossier) => ["operations", "infrastructure", "visualization"].includes(project.domain) || project.tags.some((tag) => tag.includes("tool") || tag.includes("operator") || tag.includes("control")) },
  { id: "corpus", label: "Corpus", matches: (project: ProjectDossier) => project.domain === "corpus" || project.domain === "memory" || project.tags.some((tag) => tag.includes("archive") || tag.includes("retrieval")) },
  { id: "research", label: "Research", matches: (project: ProjectDossier) => project.domain === "research" || project.tags.includes("research") },
  { id: "writing", label: "Writing", matches: (project: ProjectDossier) => project.domain === "writing" || project.tags.includes("markdown") }
] as const;

const initialDaemonStatus: DaemonStatus = __COGNOPTICON_PUBLIC_DEMO__
  ? {
    online: false,
    url: "public-static-demo",
    checkedAt: new Date().toISOString(),
    runtimeMode: "public_demo",
    allowedRootCount: 0,
    jobs: { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0, timed_out: 0 },
    orchestrator: { sessions: 0, taskEvents: 0 },
    error: "disabled in public static demo"
  }
  : { online: false, url: "http://127.0.0.1:8787", checkedAt: new Date().toISOString(), runtimeMode: "offline", error: "not checked" };

const DAEMON_JOB_POLL_INTERVAL_MS = 500;
const DAEMON_JOB_DEFAULT_RUNTIME_MS = 900_000;
const DAEMON_JOB_MIN_POLL_MS = 30_000;
const DAEMON_JOB_POLL_GRACE_MS = 5_000;
const daemonJobTerminalStatuses = ["completed", "failed", "cancelled", "timed_out"] as const;

export default function App() {
  const [workspace, setWorkspace] = useState<CognopticonWorkspace>(sampleWorkspace);
  const [selectedId, setSelectedId] = useState(sampleWorkspace.projects[0]?.id ?? "workspace-core");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<ProjectDomain | "all">("all");
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
  const [focusMode, setFocusMode] = useState<FocusMode>("all");
  const [selectedDomains, setSelectedDomains] = useState<Set<ProjectDomain>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [screenNodes, setScreenNodes] = useState<ProjectLabel[]>([]);
  const [graphCommand, setGraphCommand] = useState<GraphCommand | null>(null);
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus>(initialDaemonStatus);
  const [orchestratorActive, setOrchestratorActive] = useState(false);
  const [orchestratorMessage, setOrchestratorMessage] = useState("Cognopticon prepares mission handoffs and records approved local events. Worker agents require explicit terminal handoff outside the browser and daemon.");
  const [orchestratorSessionId, setOrchestratorSessionId] = useState<string | undefined>();
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [taskSyncState, setTaskSyncState] = useState<Record<string, "local" | "syncing" | "synced" | "error">>({});
  const [verificationState, setVerificationState] = useState<Record<string, { status: "idle" | "running" | "passed" | "failed"; summary: string }>>({});
  const [runtimeEvents, setRuntimeEvents] = useState<CognopticonEvent[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [runJobs, setRunJobs] = useState<DaemonRunJob[]>([]);
  const [runsLoadedKey, setRunsLoadedKey] = useState("");
  const [runHistoryOpen, setRunHistoryOpen] = useState(false);
  const [runtimeHealthOpen, setRuntimeHealthOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const [brief, setBrief] = useState<MissionBrief | null>(null);

  useEffect(() => {
    let alive = true;
    loadWorkspace().then((nextWorkspace) => {
      if (!alive) return;
      setWorkspace(nextWorkspace);
      setSelectedId((current) => nextWorkspace.projects.some((project) => project.id === current) ? current : nextWorkspace.projects[0]?.id ?? "workspace-core");
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    checkDaemonHealth().then((status) => {
      if (alive) setDaemonStatus(status);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!daemonStatus.online) return;
    return subscribeDaemonEvents((event) => {
      setRuntimeEvents((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 80));
    }, daemonStatus.url);
  }, [daemonStatus.online, daemonStatus.url]);

  useEffect(() => {
    if (!daemonStatus.online) return;
    let alive = true;
    getOrchestratorState(daemonStatus.url).then((state) => {
      if (!alive || !state.ok) return;
      const ledger = taskLedgerFromState(state.completedTaskIds, state.taskEvents);
      setCompletedTasks(ledger.completedTasks);
      setTaskSyncState(ledger.syncState);
      if (!state.active) return;
      const restoredSessionId = state.latestSessionId ?? state.session?.sessionId;
      if (!restoredSessionId) {
        setOrchestratorActive(false);
        setOrchestratorSessionId(undefined);
        setOrchestratorMessage("Daemon reported orchestrator history without an active session id. Task checks stay local until you start a new orchestrator session.");
        return;
      }
      setOrchestratorActive(true);
      setOrchestratorSessionId(restoredSessionId);
      setOrchestratorMessage(`Daemon restored the orchestrator session with ${state.taskEvents.length} recorded task event${state.taskEvents.length === 1 ? "" : "s"}.`);
    });
    return () => {
      alive = false;
    };
  }, [daemonStatus.online, daemonStatus.url]);

  const projectDossiers = workspace.projects;
  const projectRelationships = workspace.relationships;
  const runStorageKey = useMemo(() => workspaceRunStorageKey(workspace), [workspace]);
  const allDomains = useMemo(() => Array.from(new Set(projectDossiers.map((project) => project.domain))).sort() as ProjectDomain[], [projectDossiers]);
  const allStatuses = useMemo(() => Array.from(new Set(projectDossiers.map((project) => project.status))).sort() as ProjectStatus[], [projectDossiers]);
  const selectedProject = projectDossiers.find((project) => project.id === selectedId) ?? projectDossiers[0] ?? sampleWorkspace.projects[0];
  const nodes = useMemo(() => adaptProjectDossiers(projectDossiers, projectRelationships), [projectDossiers, projectRelationships]);
  const selectedNode = nodes.find((node) => node.id === selectedProject.id) ?? nodes[0];
  const agencyTick = useMemo(() => runAgencyTick({
    workspaceId: workspace.title,
    nodes,
    relationships: projectRelationships,
    events: runtimeEvents,
    goals: [],
    policy: {
      autonomyLevel: daemonStatus.online ? "execute_registered_actions" : "prepare_missions",
      allowedRoots: workspace.roots,
      allowedCommands: ["npm", "node"],
      autoGenerateMissions: true,
      autoRunReadOnlyChecks: false,
      autoLaunchRegisteredTools: false,
      autoDelegateToAgents: false,
      requireApprovalFor: ["file_edits", "file_deletes", "git_commit", "git_push", "external_network", "agent_delegation", "long_running_process"]
    },
    daemonStatus
  }), [daemonStatus, nodes, projectRelationships, runtimeEvents, workspace.roots, workspace.title]);

  useEffect(() => {
    pruneLegacyRunStorage();
    setRuns(loadStoredRuns(runStorageKey));
    setRunsLoadedKey(runStorageKey);
  }, [runStorageKey]);

  useEffect(() => {
    if (runsLoadedKey !== runStorageKey) return;
    window.localStorage.setItem(runStorageKey, JSON.stringify(runs.slice(0, 20)));
  }, [runStorageKey, runs, runsLoadedKey]);

  useEffect(() => {
    if (!daemonStatus.online || runsLoadedKey !== runStorageKey) return;
    let alive = true;
    getDaemonRunState(daemonStatus.url).then((state) => {
      if (!alive || !state.ok) return;
      setRuns((current) => mergeRunRecords(current, state.runs));
      setRunJobs(state.jobs);
    });
    return () => {
      alive = false;
    };
  }, [daemonStatus.online, daemonStatus.url, runStorageKey, runsLoadedKey]);

  const filteredProjects = useMemo(() => {
    return projectDossiers.filter((project) => {
      const domainOk = domain === "all" || project.domain === domain;
      const statusOk = status === "all" || project.status === status;
      const focusOk = focusModeMatches(project, focusMode);
      const queryOk = query.trim() === "" || projectMatches(project, query);
      const domainClusterOk = selectedDomains.size === 0 || selectedDomains.has(project.domain);
      const typeOk = selectedTypes.size === 0 || projectTypeFilters.some((item) => selectedTypes.has(item.id) && item.matches(project));
      const projectOk = selectedProjects.size === 0 || selectedProjects.has(project.id);
      return domainOk && statusOk && focusOk && queryOk && domainClusterOk && typeOk && projectOk;
    });
  }, [domain, focusMode, projectDossiers, query, selectedDomains, selectedProjects, selectedTypes, status]);

  const filteredIds = useMemo(() => new Set(filteredProjects.map((project) => project.id)), [filteredProjects]);

  function focusFirstMatch(value: string) {
    setQuery(value);
    const normalized = value.trim().toLowerCase();
    const matches = projectDossiers.filter((project) => projectMatches(project, value));
    const match = matches.find((project) => project.name.toLowerCase() === normalized)
      ?? matches.find((project) => project.name.toLowerCase().includes(normalized))
      ?? matches.find((project) => project.id !== "workspace-core")
      ?? matches[0];
    if (value.trim() && match) setSelectedId(match.id);
  }

  function createBrief(project: ProjectDossier) {
    const nextBrief = generateMissionBrief(project, projectDossiers, projectRelationships);
    setBrief(nextBrief);
    upsertRun({
      id: missionRunId(nextBrief),
      projectId: project.id,
      title: `${project.name} mission`,
      status: "awaiting_approval",
      summary: "Mission packet generated. Approval required before dispatch.",
      createdAt: nextBrief.generatedAt,
      updatedAt: new Date().toISOString()
    });
  }

  function createProposalBrief(proposal: InterventionProposal) {
    const mission = compileMissionForProposal(proposal, nodes);
    const nextBrief = { projectId: proposal.nodeIds[0] ?? selectedProject.id, markdown: mission.markdown, generatedAt: mission.createdAt };
    setBrief(nextBrief);
    upsertRun({
      id: missionRunId(nextBrief),
      projectId: nextBrief.projectId,
      title: mission.title,
      status: "awaiting_approval",
      summary: "Proposal mission compiled. Approval required before dispatch.",
      createdAt: mission.createdAt,
      updatedAt: new Date().toISOString()
    });
  }

  function toggleSetValue<T>(set: Set<T>, value: T) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function resetOverlayFilters() {
    setSelectedDomains(new Set());
    setSelectedTypes(new Set());
    setSelectedProjects(new Set());
  }

  async function activateOrchestrator() {
    setQueueOpen(true);
    setDetailOpen(false);
    setFocusMode("all");
    resetOverlayFilters();
    requestAnimationFrame(() => {
      document.querySelector(".canvas-stage")?.scrollIntoView({ block: "center", behavior: "smooth" });
    });

    if (!daemonStatus.online) {
      setOrchestratorActive(true);
      setOrchestratorSessionId(undefined);
      setOrchestratorMessage("Visualizer is armed locally. Daemon is offline, so the orchestrator can prepare and focus missions but cannot dispatch local jobs or worker agents.");
      return;
    }

    setOrchestratorActive(false);
    setOrchestratorSessionId(undefined);
    setOrchestratorMessage("Requesting an orchestrator session from the local daemon.");
    const result = await startOrchestratorSession({
      focusProjectId: selectedProject.id,
      visualizerUrl: window.location.href
    }, daemonStatus.url);
    if (result.ok && result.sessionId) {
      setOrchestratorActive(true);
      setOrchestratorSessionId(result.sessionId);
      setOrchestratorMessage("Daemon acknowledged the user-facing orchestrator session. Task checks now write local daemon events while worker agents remain explicit terminal handoffs.");
    } else {
      setOrchestratorActive(false);
      setOrchestratorSessionId(undefined);
      setOrchestratorMessage(`Daemon could not start an orchestrator session. Task checks remain local. ${result.message}`);
    }
  }

  const queue = useMemo(() => nextActionQueue(filteredProjects).slice(0, 5), [filteredProjects]);
  const mobileProposal = agencyTick.proposals.find((proposal) => proposal.nodeIds.includes(selectedProject.id));
  const mobileQueueProject = queue.find((project) => project.id === selectedProject.id) ?? queue[0];
  const mobileActionKicker = mobileProposal ? "Top proposal" : "Selected";
  const mobileActionTitle = mobileProposal?.title ?? selectedProject.name;
  const mobileActionSummary = mobileProposal?.summary ?? mobileQueueProject?.nextMove ?? selectedProject.nextMove;
  const activeOverlayFilterCount = selectedDomains.size + selectedTypes.size + selectedProjects.size;
  const graphStats = useMemo(() => ({
    ready: nodes.filter((node) => filteredIds.has(node.id) && node.state.readiness >= 68).length,
    anomalous: nodes.filter((node) => filteredIds.has(node.id) && node.visual.anomalyIntensity > 0.3).length,
    launchable: nodes.filter((node) => filteredIds.has(node.id) && node.launch).length,
    activeLinks: projectRelationships.filter((relationship) => filteredIds.has(relationship.source) && filteredIds.has(relationship.target)).length
  }), [filteredIds, nodes, projectRelationships]);

  async function toggleTask(project: ProjectDossier, task: ReturnType<typeof projectTaskItems>[number]) {
    const completed = !completedTasks.has(task.id);
    setSelectedId(project.id);
    setCompletedTasks((value) => {
      const next = new Set(value);
      if (completed) next.add(task.id);
      else next.delete(task.id);
      return next;
    });

    if (!orchestratorActive) {
      setTaskSyncState((value) => ({ ...value, [task.id]: "local" }));
      setOrchestratorMessage("Task marked locally. Start the orchestrator to write checks into the daemon event log.");
      return;
    }

    if (!daemonStatus.online) {
      setTaskSyncState((value) => ({ ...value, [task.id]: "local" }));
      setOrchestratorMessage("Task marked locally. Daemon is offline, so no runtime event was recorded.");
      return;
    }

    if (!orchestratorSessionId) {
      setTaskSyncState((value) => ({ ...value, [task.id]: "local" }));
      setOrchestratorActive(false);
      setOrchestratorMessage("Task marked locally. No daemon orchestrator session is armed; start the orchestrator again to record daemon task events.");
      return;
    }

    setTaskSyncState((value) => ({ ...value, [task.id]: "syncing" }));
    const result = await recordOrchestratorTaskEvent({
      sessionId: orchestratorSessionId,
      taskId: task.id,
      projectId: project.id,
      label: task.label,
      completed
    }, daemonStatus.url);
    if (!result.ok && isStaleOrchestratorSessionMessage(result.message)) {
      setOrchestratorActive(false);
      setOrchestratorSessionId(undefined);
      setTaskSyncState((value) => ({ ...value, [task.id]: "local" }));
      setOrchestratorMessage(`${project.name}: task marked locally because the daemon orchestrator session expired. Start the orchestrator again to resume event logging.`);
      return;
    }
    setTaskSyncState((value) => ({ ...value, [task.id]: result.ok ? "synced" : "error" }));
    setOrchestratorMessage(result.ok
      ? `${project.name}: ${result.message}`
      : `${project.name}: ${result.message}`);
  }

  async function runVerification(project: ProjectDossier) {
    setSelectedId(project.id);
    if (!daemonStatus.online) {
      setVerificationState((value) => ({ ...value, [project.id]: { status: "failed", summary: "Daemon offline; verification was not run." } }));
      return;
    }

    const command = verificationCommandFor(project);
    if (!command) {
      setVerificationState((value) => ({ ...value, [project.id]: { status: "failed", summary: "No safe verification command inferred for this project." } }));
      return;
    }

    setVerificationState((value) => ({ ...value, [project.id]: { status: "running", summary: `${command.command} ${command.args.join(" ")}` } }));
    const result = await dispatchDaemonRun({
      runId: `verify:${project.id}`,
      projectId: project.id,
      title: `${project.name} verification`,
      command,
      createdAt: new Date().toISOString()
    });
    setVerificationState((value) => ({
      ...value,
      [project.id]: {
        status: result.status === "completed" ? "passed" : result.status === "running" ? "running" : "failed",
        summary: result.summary
      }
    }));
    setOrchestratorMessage(result.status === "running"
      ? `${project.name}: verification is still running via daemon job.`
      : `${project.name}: verification ${result.status === "completed" ? "passed" : "failed"} via daemon job.`);
  }

  async function markMissionReviewed() {
    if (!brief) return;
    const project = projectDossiers.find((item) => item.id === brief.projectId) ?? selectedProject;
    const runId = missionRunId(brief);
    upsertRun({
      id: runId,
      projectId: project.id,
      title: `${project.name} mission`,
      status: "reviewed",
      summary: "Mission reviewed and staged. No command was dispatched; use Run or Run Verification for daemon execution.",
      createdAt: brief.generatedAt,
      updatedAt: new Date().toISOString()
    });
  }

  function createMobileActionMission() {
    if (mobileProposal) createProposalBrief(mobileProposal);
    else createBrief(selectedProject);
  }

  async function runSelectedLaunch() {
    const command = selectedNode.launch?.commands?.[0];
    if (!command) return;
    setSelectedId(selectedNode.id);
    const runId = `launch:${selectedNode.id}:${Date.now()}`;
    upsertRun({
      id: runId,
      projectId: selectedNode.id,
      title: command.label,
      status: daemonStatus.online ? "running" : "blocked",
      summary: daemonStatus.online ? `Running ${command.command} ${command.args.join(" ")} through daemon.` : "Launch blocked: daemon is offline.",
      command: `${command.command} ${command.args.join(" ")}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (!daemonStatus.online) return;
    await dispatchDaemonRun({ runId, projectId: selectedNode.id, title: command.label, command, createdAt: new Date().toISOString() });
  }

  function upsertRun(run: RunRecord) {
    setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)].slice(0, 20));
  }

  function openRunHistory(runId?: string) {
    setSelectedRunId(runId ?? runs[0]?.id);
    setRunHistoryOpen(true);
  }

  async function dispatchDaemonRun({
    runId,
    projectId,
    title,
    command,
    createdAt
  }: {
    runId: string;
    projectId: string;
    title: string;
    command: { cwd?: string; command: string; args: string[] };
    createdAt: string;
  }) {
    const commandText = `${command.command} ${command.args.join(" ")}`.trim();
    const cwd = command.cwd ?? projectDossiers.find((project) => project.id === projectId)?.path ?? selectedProject.path;
    upsertRun({ id: runId, projectId, title, status: "dispatched", summary: `Dispatching ${commandText}`, command: commandText, createdAt, updatedAt: new Date().toISOString() });
    const queued = await createDaemonJob({ runId, projectId, title, cwd, command: command.command, args: command.args }, daemonStatus.url);
    if (!queued.ok || !queued.jobId) {
      const failed = { status: "failed" as const, summary: queued.message };
      upsertRun({ id: runId, projectId, title, ...failed, command: commandText, createdAt, updatedAt: new Date().toISOString() });
      return failed;
    }
    upsertRun({ id: runId, projectId, title, status: "running", summary: `Daemon job ${queued.jobId} running: ${commandText}`, command: commandText, jobId: queued.jobId, createdAt, updatedAt: new Date().toISOString() });
    const finalJob = await waitForDaemonJob(queued.jobId, queued.job?.timeoutMs);
    if (!finalJob) {
      const pending = {
        status: "running" as const,
        summary: `Daemon job ${queued.jobId} is still running; it remains available in run history.`
      };
      upsertRun({ id: runId, projectId, title, ...pending, command: commandText, jobId: queued.jobId, createdAt, updatedAt: new Date().toISOString() });
      return pending;
    }
    const status = finalJob.status === "completed" ? "completed" as const : "failed" as const;
    const summary = `${finalJob.command} exited ${finalJob.exitCode ?? "unknown"}`;
    upsertRun({ id: runId, projectId, title, status, summary, command: commandText, jobId: queued.jobId, createdAt, updatedAt: new Date().toISOString() });
    return { status, summary };
  }

  async function waitForDaemonJob(jobId: string, timeoutMs = DAEMON_JOB_DEFAULT_RUNTIME_MS) {
    const runtimeMs = Number.isFinite(timeoutMs) ? Math.max(timeoutMs, DAEMON_JOB_MIN_POLL_MS) : DAEMON_JOB_DEFAULT_RUNTIME_MS;
    const deadline = Date.now() + runtimeMs + DAEMON_JOB_POLL_GRACE_MS;
    while (Date.now() <= deadline) {
      const result = await getDaemonJob(jobId, daemonStatus.url);
      const job = result.job;
      if (job && daemonJobTerminalStatuses.includes(job.status as (typeof daemonJobTerminalStatuses)[number])) return job;
      await new Promise((resolve) => setTimeout(resolve, DAEMON_JOB_POLL_INTERVAL_MS));
    }
    return undefined;
  }

  return (
    <main className={["app-shell", filtersOpen ? "filters-open" : "", queueOpen ? "queue-open" : ""].filter(Boolean).join(" ")}>
      <section className="topbar" aria-label="Cognopticon controls">
        <div className="brand-lockup">
          <Sparkles size={18} aria-hidden />
          <div>
            <h1>Cognopticon</h1>
            <span>{projectDossiers.length} nodes / {projectRelationships.length} links / {workspace.analysis?.source ?? "sample"}</span>
          </div>
        </div>

        <label className="search-box">
          <Search size={16} aria-hidden />
          <input
            value={query}
            onChange={(event) => focusFirstMatch(event.target.value)}
            placeholder="Search projects or paths"
            aria-label="Search projects"
          />
        </label>

        <div className="filter-row">
          <label>
            <span>Focus</span>
            <select value={focusMode} onChange={(event) => setFocusMode(event.target.value as FocusMode)} aria-label="Focus mode">
              {focusModes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Domain</span>
            <select value={domain} onChange={(event) => setDomain(event.target.value as ProjectDomain | "all")}>
              <option value="all">All</option>
              {allDomains.map((item) => (
                <option key={item} value={item}>
                  {domainLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus | "all")}>
              <option value="all">All</option>
              {allStatuses.map((item) => (
                <option key={item} value={item}>
                  {statusLabels[item]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="workspace">
        <div className={["canvas-stage", filtersOpen ? "filters-open" : "", queueOpen ? "queue-open" : ""].filter(Boolean).join(" ")}>
          <UniverseCanvas
            projects={projectDossiers}
            nodes={nodes}
            relationships={projectRelationships}
            selectedId={selectedProject.id}
            hoveredId={hoveredId}
            filteredIds={filteredIds}
            onSelect={setSelectedId}
            onHover={setHoveredId}
            onScreenNodes={setScreenNodes}
            command={graphCommand}
            labelsSuppressed={filtersOpen || queueOpen}
          />
          <NodeOverlayLayer nodes={nodes} screenNodes={screenNodes} hoveredId={hoveredId} />
          <div className="graph-controls" aria-label="Graph controls">
            <button type="button" aria-label="Fit" onClick={() => setGraphCommand({ type: "fit", nonce: Date.now() })}>
              <Maximize2 size={16} aria-hidden />
              <span>Fit</span>
            </button>
            <button type="button" aria-label="Center" onClick={() => setGraphCommand({ type: "recenter", nonce: Date.now() })}>
              <LocateFixed size={16} aria-hidden />
              <span>Center</span>
            </button>
          </div>
          <div className="graph-instrument" aria-label="Graph state encoding">
            <span><i className="key readiness" />Ready {graphStats.ready}</span>
            <span><i className="key anomaly" />Anomaly {graphStats.anomalous}</span>
            <span><i className="key launch" />Launch {graphStats.launchable}</span>
            <span><i className="key link" />Links {graphStats.activeLinks}</span>
          </div>

          <div className="queue-overlay">
            <button
              type="button"
              className="circle-overlay-button"
              aria-label="Toggle next action queue"
              aria-expanded={queueOpen}
              onClick={() => setQueueOpen((value) => !value)}
            >
              <ListChecks size={18} aria-hidden />
            </button>
            {queueOpen && (
              <aside className="queue-popover" aria-label="Next action queue">
                <header>
                  <div>
                    <strong>Task Queue</strong>
                    <span>{queue.length} projects prioritized</span>
                  </div>
                  <button type="button" className="icon-button" aria-label="Close next action queue" onClick={() => setQueueOpen(false)}>
                    <X size={16} aria-hidden />
                  </button>
                </header>
                <div className="task-list">
                  {queue.map((project) => {
                    const tasks = projectTaskItems(project);
                    const completedCount = tasks.filter((task) => completedTasks.has(task.id)).length;
                    const completion = Math.round((completedCount / tasks.length) * 100);
                    return (
                      <details key={project.id} className="task-card">
                        <summary onClick={() => setSelectedId(project.id)}>
                          <span className="task-summary-copy">
                            <span>{project.name}</span>
                            <small>{project.nextMove}</small>
                          </span>
                          <span className="progress-ring" style={{ "--completion": `${completion}%` } as CSSProperties}>
                            {completion}
                          </span>
                        </summary>
                        <div className="subtask-list">
                          {tasks.map((task) => (
                            <label key={task.id}>
                              <input type="checkbox" checked={completedTasks.has(task.id)} onChange={() => void toggleTask(project, task)} />
                              <span>{task.label}</span>
                              <em data-state={taskSyncState[task.id] ?? "idle"}>
                                {taskSyncLabel(taskSyncState[task.id], orchestratorActive)}
                              </em>
                            </label>
                          ))}
                          <button type="button" className="verify-button" onClick={() => void runVerification(project)}>
                            Run Verification
                          </button>
                          {verificationState[project.id] && (
                            <output className="verification-output" data-state={verificationState[project.id].status}>
                              {verificationState[project.id].status}: {verificationState[project.id].summary}
                            </output>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </aside>
            )}
          </div>

          <div className="filter-overlay">
            <button type="button" className="filter-trigger" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
              <Activity size={16} aria-hidden />
              <span>{filteredProjects.length} visible</span>
              {activeOverlayFilterCount > 0 && <strong>{activeOverlayFilterCount}</strong>}
            </button>
            {filtersOpen && (
              <div className="filter-popover" aria-label="Project visibility filters">
                <header>
                  <strong>Visibility</strong>
                  <div className="popover-actions">
                    <button type="button" onClick={resetOverlayFilters}>Reset</button>
                    <button type="button" className="icon-button" aria-label="Close visibility filters" onClick={() => setFiltersOpen(false)}>
                      <X size={16} aria-hidden />
                    </button>
                  </div>
                </header>

                <details open>
                  <summary>Type</summary>
                  <div className="checkbox-grid">
                    {projectTypeFilters.map((item) => (
                      <label key={item.id}>
                        <input
                          type="checkbox"
                          checked={selectedTypes.has(item.id)}
                          onChange={() => setSelectedTypes((value) => toggleSetValue(value, item.id))}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </details>

                <details>
                  <summary>Domain</summary>
                  <div className="checkbox-grid">
                    {allDomains.map((item) => (
                      <label key={item}>
                        <input
                          type="checkbox"
                          checked={selectedDomains.has(item)}
                          onChange={() => setSelectedDomains((value) => toggleSetValue(value, item))}
                        />
                        <span>{domainLabels[item]}</span>
                      </label>
                    ))}
                  </div>
                </details>

                <details>
                  <summary>Project</summary>
                  <div className="project-checkbox-list">
                    {projectDossiers.map((project) => (
                      <label key={project.id}>
                        <input
                          type="checkbox"
                          checked={selectedProjects.has(project.id)}
                          onChange={() => setSelectedProjects((value) => toggleSetValue(value, project.id))}
                        />
                        <span>{project.name}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>

          <section className="mobile-action-dock" aria-label="Mobile workflow actions">
            <div>
              <span>{mobileActionKicker}</span>
              <strong>{mobileActionTitle}</strong>
              <p>{mobileActionSummary}</p>
            </div>
            <div className="mobile-action-buttons">
              <button type="button" onClick={createMobileActionMission}>Mission</button>
              <button type="button" onClick={() => void activateOrchestrator()}>
                {orchestratorActive ? "Recenter" : "Orchestrate"}
              </button>
            </div>
          </section>
        </div>

        <NodeCockpit
          node={selectedNode}
          beliefs={agencyTick.beliefs}
          proposals={agencyTick.proposals}
          daemonStatus={daemonStatus}
          launchRunStatus={runs.find((run) => run.projectId === selectedNode.id)?.summary}
          onCreateMission={() => createBrief(selectedProject)}
          onRunLaunch={() => void runSelectedLaunch()}
          onOpenDetail={() => setDetailOpen(true)}
        />
        <CognitionRail
          tick={agencyTick}
          daemonStatus={daemonStatus}
          orchestratorActive={orchestratorActive}
          orchestratorMessage={orchestratorMessage}
          runtimeEvents={runtimeEvents}
          runs={runs}
          onFocus={setSelectedId}
          onMission={createProposalBrief}
          onStartOrchestrator={activateOrchestrator}
          onOpenRunHistory={() => openRunHistory()}
          onOpenRuntimeHealth={() => setRuntimeHealthOpen(true)}
          onInspectRun={(runId) => openRunHistory(runId)}
        />
      </section>

      <DetailTray
        open={detailOpen}
        project={selectedProject}
        projects={projectDossiers}
        relationships={projectRelationships}
        workspace={workspace}
        onCreateBrief={createBrief}
        onClose={() => setDetailOpen(false)}
      />
      <MissionDrawer
        brief={brief}
        project={projectDossiers.find((project) => project.id === brief?.projectId) ?? selectedProject}
        dispatchStatus={brief ? runs.find((run) => run.id === missionRunId(brief))?.status : undefined}
        dispatchSummary={brief ? runs.find((run) => run.id === missionRunId(brief))?.summary : undefined}
        onMarkReviewed={() => void markMissionReviewed()}
        onClose={() => setBrief(null)}
      />
      <RunHistoryDrawer
        open={runHistoryOpen}
        runs={runs}
        jobs={runJobs}
        selectedRunId={selectedRunId}
        onSelectRun={setSelectedRunId}
        onClose={() => setRunHistoryOpen(false)}
      />
      <RuntimeHealthDrawer
        open={runtimeHealthOpen}
        daemonStatus={daemonStatus}
        onClose={() => setRuntimeHealthOpen(false)}
      />
    </main>
  );
}

function projectTaskItems(project: ProjectDossier) {
  return [
    { id: `${project.id}:inspect`, label: "Inspect current state and confirm the smallest useful move" },
    { id: `${project.id}:scope`, label: `Keep scope inside ${project.path}` },
    { id: `${project.id}:advance`, label: project.nextMove },
    { id: `${project.id}:verify`, label: "Run a concrete verification and capture the result" }
  ];
}

function taskSyncLabel(state: "local" | "syncing" | "synced" | "error" | undefined, orchestratorActive: boolean) {
  if (state === "syncing") return "syncing";
  if (state === "synced") return "daemon";
  if (state === "error") return "error";
  if (state === "local") return "local";
  return orchestratorActive ? "ready" : "local";
}

function taskLedgerFromState(completedTaskIds: string[], events: OrchestratorTaskEvent[]) {
  const completedTasks = new Set(completedTaskIds);
  const syncState = Object.fromEntries(completedTaskIds.map((taskId) => [taskId, "synced"])) as Record<string, "synced">;
  for (const event of [...events].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    syncState[event.taskId] = "synced";
  }
  return { completedTasks, syncState };
}

function isStaleOrchestratorSessionMessage(message: string) {
  return message.startsWith("Unknown orchestrator session:");
}

function verificationCommandFor(project: ProjectDossier) {
  const evidence = project.evidence.map((item) => `${item.label} ${item.path}`).join(" ").toLowerCase();
  if (evidence.includes("package.json")) return { command: "npm", args: ["test"] };
  return undefined;
}

function missionRunId(brief: MissionBrief) {
  return `mission:${brief.projectId}:${brief.generatedAt}`;
}

function workspaceRunStorageKey(workspace: CognopticonWorkspace) {
  const profile = safeStorageSegment(workspace.profile?.id ?? workspace.analysis?.source ?? "sample");
  const fingerprint = stableStorageHash([
    workspace.profile?.id,
    workspace.profile?.deviceId,
    workspace.profile?.stateDir,
    workspace.analysis?.source,
    workspace.title,
    workspace.generatedAt,
    ...workspace.roots
  ].filter(Boolean).join("\u001f"));
  return `cognopticon:runs:v2:${profile}:${fingerprint}`;
}

function loadStoredRuns(storageKey: string): RunRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredRunRecord).slice(0, 20);
  } catch {
    return [];
  }
}

function mergeRunRecords(localRuns: RunRecord[], daemonRuns: RunRecord[]) {
  const byId = new Map<string, RunRecord>();
  for (const run of localRuns) byId.set(run.id, run);
  for (const run of daemonRuns) byId.set(run.id, run);
  return [...byId.values()].sort(compareRunRecords).slice(0, 20);
}

function compareRunRecords(left: RunRecord, right: RunRecord) {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function safeStorageSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
}

function stableStorageHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isStoredRunRecord(value: unknown): value is RunRecord {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<RunRecord>;
  const validStatuses: RunRecord["status"][] = ["draft", "awaiting_approval", "reviewed", "approved", "dispatched", "running", "completed", "failed", "blocked"];
  return typeof run.id === "string"
    && typeof run.projectId === "string"
    && typeof run.title === "string"
    && typeof run.summary === "string"
    && typeof run.createdAt === "string"
    && typeof run.updatedAt === "string"
    && Boolean(run.status && validStatuses.includes(run.status));
}

function pruneLegacyRunStorage() {
  if (typeof window === "undefined") return;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    if (key === "cognopticon:runs" || (key.startsWith("cognopticon:runs:") && !key.startsWith("cognopticon:runs:v2:"))) {
      window.localStorage.removeItem(key);
    }
  }
}
