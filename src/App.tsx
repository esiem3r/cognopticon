import { type CSSProperties, useMemo, useState } from "react";
import { Activity, ListChecks, Search, Sparkles, X } from "lucide-react";
import { DossierPanel } from "./components/DossierPanel";
import { MissionDrawer } from "./components/MissionDrawer";
import { UniverseCanvas } from "./components/UniverseCanvas";
import { projectDossiers, projectRelationships } from "./lib/data";
import { domainLabels, focusModeMatches, focusModes, generateMissionBrief, nextActionQueue, projectMatches, statusLabels, type FocusMode } from "./lib/domain";
import type { MissionBrief, ProjectDomain, ProjectDossier, ProjectStatus } from "./types/cognopticon";

const allDomains = Array.from(new Set(projectDossiers.map((project) => project.domain))).sort() as ProjectDomain[];
const allStatuses = Array.from(new Set(projectDossiers.map((project) => project.status))).sort() as ProjectStatus[];
const projectTypeFilters = [
  { id: "ai", label: "AI", matches: (project: ProjectDossier) => project.domain === "agentics" || project.tags.some((tag) => tag.includes("agent") || tag === "models") },
  { id: "math", label: "Math", matches: (project: ProjectDossier) => project.tags.includes("math") || project.tags.includes("proof") || project.tags.includes("calculus") },
  { id: "tools", label: "Tools", matches: (project: ProjectDossier) => ["operations", "infrastructure", "visualization"].includes(project.domain) || project.tags.some((tag) => tag.includes("tool") || tag.includes("operator") || tag.includes("control")) },
  { id: "corpus", label: "Corpus", matches: (project: ProjectDossier) => project.domain === "corpus" || project.domain === "memory" || project.tags.some((tag) => tag.includes("archive") || tag.includes("retrieval")) },
  { id: "research", label: "Research", matches: (project: ProjectDossier) => project.domain === "research" || project.tags.includes("research") },
  { id: "writing", label: "Writing", matches: (project: ProjectDossier) => project.domain === "writing" || project.tags.includes("markdown") }
] as const;

export default function App() {
  const [selectedId, setSelectedId] = useState("cognopticon");
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
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [brief, setBrief] = useState<MissionBrief | null>(null);

  const selectedProject = projectDossiers.find((project) => project.id === selectedId) ?? projectDossiers[0];

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
  }, [domain, focusMode, query, selectedDomains, selectedProjects, selectedTypes, status]);

  const filteredIds = useMemo(() => new Set(filteredProjects.map((project) => project.id)), [filteredProjects]);

  function focusFirstMatch(value: string) {
    setQuery(value);
    const match = projectDossiers.find((project) => projectMatches(project, value));
    if (value.trim() && match) setSelectedId(match.id);
  }

  function createBrief(project: ProjectDossier) {
    setBrief(generateMissionBrief(project, projectDossiers, projectRelationships));
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

  const queue = useMemo(() => nextActionQueue(filteredProjects).slice(0, 5), [filteredProjects]);
  const activeOverlayFilterCount = selectedDomains.size + selectedTypes.size + selectedProjects.size;

  function toggleTask(taskId: string) {
    setCompletedTasks((value) => toggleSetValue(value, taskId));
  }

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Cognopticon controls">
        <div className="brand-lockup">
          <Sparkles size={18} aria-hidden />
          <div>
            <h1>Cognopticon</h1>
            <span>{projectDossiers.length} projects / {projectRelationships.length} relationships</span>
          </div>
        </div>

        <label className="search-box">
          <Search size={16} aria-hidden />
          <input
            value={query}
            onChange={(event) => focusFirstMatch(event.target.value)}
            placeholder="Search projects, paths, friction, next moves"
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
        <div className="canvas-stage">
          <UniverseCanvas
            projects={projectDossiers}
            relationships={projectRelationships}
            selectedId={selectedProject.id}
            hoveredId={hoveredId}
            filteredIds={filteredIds}
            onSelect={setSelectedId}
            onHover={setHoveredId}
          />

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
                              <input type="checkbox" checked={completedTasks.has(task.id)} onChange={() => toggleTask(task.id)} />
                              <span>{task.label}</span>
                            </label>
                          ))}
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
                  <button type="button" onClick={resetOverlayFilters}>Reset</button>
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
        </div>

        <DossierPanel
          project={selectedProject}
          projects={projectDossiers}
          relationships={projectRelationships}
          onCreateBrief={createBrief}
        />
      </section>

      <MissionDrawer brief={brief} project={selectedProject} onClose={() => setBrief(null)} />
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
