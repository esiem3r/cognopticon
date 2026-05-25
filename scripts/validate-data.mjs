#!/usr/bin/env node
import metadata from "../src/data/workspace-meta.json" with { type: "json" };
import projects from "../src/data/projects.json" with { type: "json" };
import relationships from "../src/data/relationships.json" with { type: "json" };
import roots from "../src/data/workspace-roots.json" with { type: "json" };
import { releasePrivacyFindings } from "./release-privacy-rules.mjs";

const allowedStatuses = new Set(["active", "forming", "legacy", "paused", "archive"]);
const allowedHealth = new Set(["strong", "promising", "fragile", "stalled", "unknown"]);
const allowedDomains = new Set(["agentics", "memory", "research", "visualization", "corpus", "operations", "infrastructure", "writing"]);
const allowedDecisions = new Set(["build", "triage", "merge", "pause", "archive"]);
const allowedKinds = new Set(["feeds", "depends_on", "inspired_by", "supersedes", "archive_source", "agent_target", "reference"]);

const errors = [];

validatePublicDemo({
  ...metadata,
  roots,
  projects,
  relationships
});

if (errors.length) {
  console.error(`Cognopticon data validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Cognopticon demo data valid: ${projects.length} projects, ${relationships.length} relationships.`);

function requireString(record, field, label) {
  if (typeof record[field] !== "string" || record[field].trim() === "") {
    errors.push(`${label}.${field} must be a non-empty string`);
  }
}

function requireNumber(record, field, label, min, max) {
  if (!Number.isFinite(record[field]) || record[field] < min || record[field] > max) {
    errors.push(`${label}.${field} must be a number from ${min} to ${max}`);
  }
}

function requireEnum(record, field, allowed, label) {
  if (!allowed.has(record[field])) {
    errors.push(`${label}.${field} must be one of: ${Array.from(allowed).join(", ")}`);
  }
}

function requireDate(record, field, label) {
  requireString(record, field, label);
  if (typeof record[field] === "string" && Number.isNaN(Date.parse(record[field]))) {
    errors.push(`${label}.${field} must be a parseable date`);
  }
}

function validatePublicDemo(workspace) {
  const text = JSON.stringify(workspace);
  for (const finding of releasePrivacyFindings(text)) {
    errors.push(`demo workspace contains private or secret-looking pattern: ${finding.label}`);
  }
  requireDate(workspace, "generatedAt", "demo.workspace");
  requireString(workspace, "title", "demo.workspace");
  if (!workspace.analysis || workspace.analysis.source !== "sample") errors.push("demo.workspace.analysis.source must be sample");
  requireString(workspace.analysis ?? {}, "summary", "demo.workspace.analysis");
  if (!Array.isArray(workspace.projects) || workspace.projects.length < 8) errors.push("demo workspace must contain at least 8 projects");
  if (!workspace.projects.some((project) => project.id === "workspace-core")) errors.push("demo workspace must contain workspace-core self node");
  if (!Array.isArray(workspace.roots) || !workspace.roots.every((root) => typeof root === "string" && root.startsWith("/demo/"))) {
    errors.push("demo workspace roots must use /demo paths only");
  }
  if (Array.isArray(workspace.projects) && !workspace.projects.every((project) => typeof project.path === "string" && project.path.startsWith("/demo/"))) {
    errors.push("demo project paths must use /demo paths only");
  }
  const projectIds = new Set();
  const relationshipIds = new Set();
  for (const [index, project] of workspace.projects.entries()) {
    validateProject(project, project.id || `demo.project[${index}]`, projectIds);
  }
  for (const [index, relationship] of workspace.relationships.entries()) {
    validateRelationship(relationship, relationship.id || `demo.relationship[${index}]`, projectIds, relationshipIds);
  }
}

function validateProject(project, label, projectIds) {
  requireString(project, "id", label);
  requireString(project, "name", label);
  requireString(project, "path", label);
  requireString(project, "purpose", label);
  requireString(project, "whyItMatters", label);
  requireString(project, "currentFriction", label);
  requireString(project, "nextMove", label);
  requireString(project, "decisionRationale", label);
  requireDate(project, "nextReview", label);
  requireNumber(project, "activity", label, 0, 1);
  requireNumber(project, "substance", label, 0, 1);
  requireEnum(project, "status", allowedStatuses, label);
  requireEnum(project, "health", allowedHealth, label);
  requireEnum(project, "domain", allowedDomains, label);
  requireEnum(project, "decision", allowedDecisions, label);
  if (!project.position || !Number.isFinite(project.position.x) || !Number.isFinite(project.position.y)) {
    errors.push(`${label}.position must include finite x and y numbers`);
  }
  if (!Array.isArray(project.missionConstraints) || project.missionConstraints.length === 0) {
    errors.push(`${label}.missionConstraints must contain at least one constraint`);
  }
  if (!Array.isArray(project.evidence) || project.evidence.length === 0) {
    errors.push(`${label}.evidence must contain at least one evidence item`);
  }
  if (projectIds.has(project.id)) errors.push(`duplicate project id: ${project.id}`);
  projectIds.add(project.id);
}

function validateRelationship(relationship, label, projectIds, relationshipIds) {
  requireString(relationship, "id", label);
  requireString(relationship, "source", label);
  requireString(relationship, "target", label);
  requireString(relationship, "label", label);
  requireEnum(relationship, "kind", allowedKinds, label);
  requireNumber(relationship, "strength", label, 0, 1);
  if (relationshipIds.has(relationship.id)) errors.push(`duplicate relationship id: ${relationship.id}`);
  relationshipIds.add(relationship.id);
  if (!projectIds.has(relationship.source)) errors.push(`${label}.source points to unknown project: ${relationship.source}`);
  if (!projectIds.has(relationship.target)) errors.push(`${label}.target points to unknown project: ${relationship.target}`);
}
