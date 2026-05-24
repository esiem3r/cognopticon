import { ClipboardList, ExternalLink, FileText, Network, ShieldCheck } from "lucide-react";
import { decisionLabels, domainColors, domainLabels, healthLabels, relatedProjects, statusLabels } from "../lib/domain";
import type { CognopticonWorkspace, ProjectDossier, ProjectRelationship } from "../types/cognopticon";

interface DossierPanelProps {
  project: ProjectDossier;
  projects: ProjectDossier[];
  relationships: ProjectRelationship[];
  workspace: CognopticonWorkspace;
  onCreateBrief: (project: ProjectDossier) => void;
}

export function DossierPanel({ project, projects, relationships, workspace, onCreateBrief }: DossierPanelProps) {
  const related = relatedProjects(project.id, projects, relationships);
  const color = domainColors[project.domain];

  return (
    <aside className="dossier-panel" aria-label={`${project.name} dossier`}>
      <div className="telemetry-kicker">
        <span>{workspace.title}</span>
        <strong>{project.analysis?.source ?? workspace.analysis?.source ?? "static"}</strong>
      </div>
      <header className="dossier-header">
        <div className="domain-mark" style={{ background: color }} />
        <div>
          <p>{domainLabels[project.domain]}</p>
          <h2>{project.name}</h2>
        </div>
      </header>

      <div className="status-grid">
        <Metric label="Status" value={statusLabels[project.status]} />
        <Metric label="Health" value={healthLabels[project.health]} />
        <Metric label="Activity" value={`${Math.round(project.activity * 100)}%`} />
        <Metric label="Substance" value={`${Math.round(project.substance * 100)}%`} />
        <Metric label="Confidence" value={`${Math.round((project.analysis?.confidence ?? 0.5) * 100)}%`} />
        <Metric label="Signals" value={`${project.analysis?.signals?.length ?? project.evidence.length}`} />
      </div>

      <section className="decision-band">
        <h3>Decision</h3>
        <p><strong>{decisionLabels[project.decision]}</strong> / review {project.nextReview}</p>
        <p>{project.decisionRationale}</p>
      </section>

      <section>
        <h3><ClipboardList size={16} aria-hidden /> Purpose</h3>
        <p>{project.purpose}</p>
      </section>

      <section>
        <h3><ShieldCheck size={16} aria-hidden /> Why It Matters</h3>
        <p>{project.whyItMatters}</p>
      </section>

      <section>
        <h3>Current Friction</h3>
        <p>{project.currentFriction}</p>
      </section>

      <section className="next-move">
        <h3>Next Move</h3>
        <p>{project.nextMove}</p>
      </section>

      <section>
        <h3><Network size={16} aria-hidden /> Relationships</h3>
        <div className="relationship-list">
          {related.map(({ project: relatedProject, relationship }) => (
            <div key={relationship.id} className="relationship-item">
              <strong>{relatedProject.name}</strong>
              <span>{relationship.label}</span>
              <small>{relationship.sourceKind ?? "static"} / strength {Math.round(relationship.strength * 100)}%</small>
              {relationship.evidence?.slice(0, 2).map((item) => (
                <em key={`${relationship.id}-${item.label}`}>{item.label}: {item.detail}</em>
              ))}
            </div>
          ))}
          {!related.length && <p>No relationships recorded.</p>}
        </div>
      </section>

      <section>
        <h3>Analysis</h3>
        <div className="analysis-grid">
          {(project.analysis?.languages?.length ?? 0) > 0 && <Metric label="Languages" value={project.analysis?.languages?.join(", ") ?? ""} />}
          {(project.analysis?.frameworks?.length ?? 0) > 0 && <Metric label="Frameworks" value={project.analysis?.frameworks?.join(", ") ?? ""} />}
        </div>
        <div className="analysis-evidence">
          {project.analysis?.layoutReasons?.map((item) => (
            <p key={`${item.label}-${item.detail}`}><strong>{item.label}</strong> {item.detail}</p>
          ))}
          {!project.analysis?.layoutReasons?.length && <p>No analysis notes yet. Generate agent enrichment packets to deepen this dossier.</p>}
        </div>
      </section>

      <section>
        <h3>Evidence</h3>
        <div className="evidence-list">
          {project.evidence.map((item) => (
            <div key={`${item.label}-${item.path}`} className="evidence-item">
              <ExternalLink size={14} aria-hidden />
              <div>
                <strong>{item.label}</strong>
                <code>{item.path}</code>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>Constraints</h3>
        <ul className="constraint-list">
          {project.missionConstraints.map((constraint) => (
            <li key={constraint}>{constraint}</li>
          ))}
        </ul>
      </section>

      <footer className="dossier-actions">
        <button type="button" onClick={() => onCreateBrief(project)}>
          <FileText size={16} aria-hidden />
          Generate Mission Brief
        </button>
      </footer>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
