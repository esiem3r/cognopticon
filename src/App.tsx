import { useMemo, useState } from "react";
import { Activity, Crosshair, FileText, GitBranch, ListChecks, Search, Sparkles } from "lucide-react";
import { DossierPanel } from "./components/DossierPanel";
import { MissionDrawer } from "./components/MissionDrawer";
import { UniverseCanvas } from "./components/UniverseCanvas";
import { projectDossiers, projectRelationships } from "./lib/data";
import { domainLabels, focusModeMatches, focusModes, generateMissionBrief, nextActionQueue, projectMatches, statusLabels, type FocusMode } from "./lib/domain";
import type { MissionBrief, ProjectDomain, ProjectDossier, ProjectStatus } from "./types/cosmopticon";

const allDomains = Array.from(new Set(projectDossiers.map((project) => project.domain))).sort() as ProjectDomain[];
const allStatuses = Array.from(new Set(projectDossiers.map((project) => project.status))).sort() as ProjectStatus[];

export default function App() {
  const [selectedId, setSelectedId] = useState("cosmopticon");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<ProjectDomain | "all">("all");
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
  const [focusMode, setFocusMode] = useState<FocusMode>("all");
  const [brief, setBrief] = useState<MissionBrief | null>(null);

  const selectedProject = projectDossiers.find((project) => project.id === selectedId) ?? projectDossiers[0];

  const filteredProjects = useMemo(() => {
    return projectDossiers.filter((project) => {
      const domainOk = domain === "all" || project.domain === domain;
      const statusOk = status === "all" || project.status === status;
      const focusOk = focusModeMatches(project, focusMode);
      const queryOk = query.trim() === "" || projectMatches(project, query);
      return domainOk && statusOk && focusOk && queryOk;
    });
  }, [domain, focusMode, query, status]);

  const filteredIds = useMemo(() => new Set(filteredProjects.map((project) => project.id)), [filteredProjects]);

  function focusFirstMatch(value: string) {
    setQuery(value);
    const match = projectDossiers.find((project) => projectMatches(project, value));
    if (value.trim() && match) setSelectedId(match.id);
  }

  function createBrief(project: ProjectDossier) {
    setBrief(generateMissionBrief(project, projectDossiers, projectRelationships));
  }

  const queue = useMemo(() => nextActionQueue(filteredProjects).slice(0, 5), [filteredProjects]);

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Cosmopticon controls">
        <div className="brand-lockup">
          <Sparkles size={18} aria-hidden />
          <div>
            <h1>Cosmopticon</h1>
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
          <div className="canvas-hud" aria-label="Navigation hints">
            <span><Crosshair size={14} aria-hidden /> drag to pan</span>
            <span>pinch or wheel to zoom</span>
            <span>click a body to inspect</span>
          </div>
        </div>

        <DossierPanel
          project={selectedProject}
          projects={projectDossiers}
          relationships={projectRelationships}
          onCreateBrief={createBrief}
        />
      </section>

      <aside className="action-queue" aria-label="Next action queue">
        <header>
          <ListChecks size={16} aria-hidden />
          <strong>Next Action Queue</strong>
        </header>
        <div>
          {queue.map((project) => (
            <button key={project.id} type="button" onClick={() => setSelectedId(project.id)}>
              <span>{project.name}</span>
              <small>{project.nextMove}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="lower-rail" aria-label="Workspace summary">
        <div>
          <Activity size={16} aria-hidden />
          <span>{filteredProjects.length} visible</span>
        </div>
        <div>
          <GitBranch size={16} aria-hidden />
          <span>{projectRelationships.filter((item) => item.source === selectedProject.id || item.target === selectedProject.id).length} linked to selection</span>
        </div>
        <button type="button" onClick={() => createBrief(selectedProject)}>
          <FileText size={16} aria-hidden />
          Mission brief
        </button>
      </section>

      <MissionDrawer brief={brief} project={selectedProject} onClose={() => setBrief(null)} />
    </main>
  );
}
