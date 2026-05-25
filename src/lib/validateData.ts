import type { ProjectDossier, ProjectRelationship } from "../types/cognopticon";
import privacyPatternSpecs from "./privacy-patterns.json";

const statuses = new Set(["active", "forming", "legacy", "paused", "archive"]);
const health = new Set(["strong", "promising", "fragile", "stalled", "unknown"]);
const domains = new Set(["agentics", "memory", "research", "visualization", "corpus", "operations", "infrastructure", "writing"]);
const decisions = new Set(["build", "triage", "merge", "pause", "archive"]);
const relationshipKinds = new Set(["feeds", "depends_on", "inspired_by", "supersedes", "archive_source", "agent_target", "reference"]);

export function validateCognopticonData(projects: ProjectDossier[], relationships: ProjectRelationship[]) {
  const errors: string[] = [];
  const projectIds = new Set<string>();
  const relationshipIds = new Set<string>();

  for (const project of projects) {
    const label = project.id || "project";
    requireText(project.id, `${label}.id`, errors);
    requireText(project.name, `${label}.name`, errors);
    requireText(project.path, `${label}.path`, errors);
    requireText(project.purpose, `${label}.purpose`, errors);
    requireText(project.whyItMatters, `${label}.whyItMatters`, errors);
    requireText(project.currentFriction, `${label}.currentFriction`, errors);
    requireText(project.nextMove, `${label}.nextMove`, errors);
    requireText(project.decisionRationale, `${label}.decisionRationale`, errors);
    requireText(project.nextReview, `${label}.nextReview`, errors);
    requireRange(project.activity, `${label}.activity`, errors);
    requireRange(project.substance, `${label}.substance`, errors);
    requireMember(project.status, statuses, `${label}.status`, errors);
    requireMember(project.health, health, `${label}.health`, errors);
    requireMember(project.domain, domains, `${label}.domain`, errors);
    requireMember(project.decision, decisions, `${label}.decision`, errors);
    if (!project.position || !Number.isFinite(project.position.x) || !Number.isFinite(project.position.y)) {
      errors.push(`${label}.position must include finite x and y numbers`);
    }
    if (!Array.isArray(project.missionConstraints) || project.missionConstraints.length === 0) {
      errors.push(`${label}.missionConstraints must contain at least one item`);
    }
    if (!Array.isArray(project.evidence) || project.evidence.length === 0) {
      errors.push(`${label}.evidence must contain at least one item`);
    }
    if (projectIds.has(project.id)) errors.push(`duplicate project id: ${project.id}`);
    projectIds.add(project.id);
  }

  for (const relationship of relationships) {
    const label = relationship.id || "relationship";
    requireText(relationship.id, `${label}.id`, errors);
    requireText(relationship.source, `${label}.source`, errors);
    requireText(relationship.target, `${label}.target`, errors);
    requireText(relationship.label, `${label}.label`, errors);
    requireRange(relationship.strength, `${label}.strength`, errors);
    requireMember(relationship.kind, relationshipKinds, `${label}.kind`, errors);
    if (relationshipIds.has(relationship.id)) errors.push(`duplicate relationship id: ${relationship.id}`);
    relationshipIds.add(relationship.id);
    if (!projectIds.has(relationship.source)) errors.push(`${label}.source points to unknown project: ${relationship.source}`);
    if (!projectIds.has(relationship.target)) errors.push(`${label}.target points to unknown project: ${relationship.target}`);
  }

  return errors;
}

export function validatePublicDemoWorkspace(projects: ProjectDossier[], roots: string[]) {
  const errors: string[] = [];
  const text = JSON.stringify({ roots, projects });
  for (const finding of privacyFindings(text)) {
    errors.push(`demo workspace contains private or secret-looking pattern: ${finding.label}`);
  }
  if (!roots.every((root) => root.startsWith("/demo/"))) errors.push("demo workspace roots must use /demo paths only");
  if (!projects.every((project) => project.path.startsWith("/demo/"))) errors.push("demo project paths must use /demo paths only");
  return errors;
}

function privacyFindings(text: string) {
  return privacyPatternSpecs.filter(({ source, flags }) => new RegExp(source, flags).test(text));
}

function requireText(value: unknown, label: string, errors: string[]) {
  if (typeof value !== "string" || value.trim() === "") errors.push(`${label} must be a non-empty string`);
}

function requireRange(value: unknown, label: string, errors: string[]) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    errors.push(`${label} must be a number from 0 to 1`);
  }
}

function requireMember(value: unknown, allowed: Set<string>, label: string, errors: string[]) {
  if (typeof value !== "string" || !allowed.has(value)) errors.push(`${label} has an unsupported value`);
}
