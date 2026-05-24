#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { loadRuntimeConfig } from "./runtime-config.mjs";

const inputArg = argValue("--input");
const outputArg = argValue("--output");
const enrichmentArg = argValue("--enrichments");
const runtimeConfig = loadRuntimeConfig(process.cwd(), { requireInitialized: !inputArg || !outputArg });
const inputPath = inputArg ?? runtimeConfig.profile.paths.rawWorkspace;
const outputPath = outputArg ?? runtimeConfig.profile.paths.workspace;
const enrichmentDir = enrichmentArg ?? runtimeConfig.profile.paths.enrichments;
const maxProjects = runtimeConfig.scan.maxProjects;

if (!existsSync(inputPath)) {
  console.error(`Missing scan input: ${inputPath}`);
  console.error("Run npm run scan first, or pass --input <workspace.raw.json>.");
  process.exit(1);
}

const scan = JSON.parse(readFileSync(inputPath, "utf8"));
const enrichments = readEnrichments(enrichmentDir);
const candidates = [...(scan.candidates ?? [])]
  .filter((candidate) => candidate.visibility === "default")
  .sort((a, b) => (b.signals?.length ?? 0) - (a.signals?.length ?? 0) || a.path.localeCompare(b.path))
  .slice(0, maxProjects);
const projects = candidates.map((candidate, index) => buildProject(candidate, index, enrichments.get(slug(candidate.name, candidate.path))));
const relationships = inferRelationships(projects, runtimeConfig.graph);

const workspace = {
  generatedAt: new Date().toISOString(),
  title: "Cognopticon Workspace",
  profile: scan.profile ?? publicProfile(runtimeConfig.profile),
  roots: scan.roots ?? [],
  projects,
  relationships,
  analysis: {
    source: enrichments.size ? "hybrid" : "generated",
    summary: enrichments.size
      ? `Generated from scan evidence plus ${enrichments.size} agent enrichment file(s).`
      : "Generated from local project signals. Run npm run enrich:packets to create agent mission packets.",
    pendingEnrichment: Math.max(projects.length - enrichments.size, 0)
  },
  review: {
    hiddenCandidates: (scan.candidates ?? []).filter((candidate) => candidate.visibility === "hidden").length,
    needsReview: (scan.candidates ?? []).filter((candidate) => candidate.visibility === "needs_review").length,
    sourceReviewPath: runtimeConfig.profile.paths.review
  }
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(workspace, null, 2)}\n`, "utf8");

function buildProject(candidate, index, enrichment) {
  const signals = candidate.signals ?? [];
  const tags = unique([...signals.map(signalTag), ...classifyTags(candidate), ...(enrichment?.tags ?? [])]);
  const domain = enrichment?.domain ?? classifyDomain(candidate, tags);
  const activity = scoreActivity(signals);
  const substance = scoreSubstance(signals);
  const purpose = enrichment?.purpose ?? purposeFrom(candidate, domain, signals);
  const nextMove = enrichment?.nextMove ?? nextMoveFrom(candidate, signals);
  const health = enrichment?.health ?? (signals.includes("tests") && signals.includes("README.md") ? "promising" : signals.includes("git") ? "unknown" : "fragile");
  const decision = enrichment?.decision ?? (health === "fragile" || health === "unknown" ? "triage" : "build");

  return {
    id: slug(candidate.name, candidate.path),
    name: candidate.name || basename(candidate.path),
    path: candidate.path,
    status: enrichment?.status ?? (activity > 0.68 ? "active" : "forming"),
    health,
    domain,
    activity,
    substance,
    position: { x: Math.cos(index) * 100, y: Math.sin(index) * 100 },
    purpose,
    whyItMatters: enrichment?.whyItMatters ?? "This project is part of the local workspace and may contain reusable context, tools, or unfinished work.",
    currentFriction: enrichment?.currentFriction ?? "Needs an agent pass to confirm intent, maturity, and next useful action.",
    nextMove,
    decision,
    decisionRationale: enrichment?.decisionRationale ?? `${decision === "build" ? "Has enough structural signal to continue." : "Needs classification before investing more work."}`,
    nextReview: enrichment?.nextReview ?? new Date().toISOString().slice(0, 10),
    missionConstraints: enrichment?.missionConstraints ?? [`Stay inside ${candidate.path} unless explicitly redirected.`, "Preserve unrelated local changes."],
    evidence: [
      { label: "Project root", path: candidate.path, kind: "repo" },
      ...signals.slice(0, 5).map((signal) => ({ label: signal, path: join(candidate.path, signal), kind: signal === "README.md" ? "file" : "note" }))
    ],
    tags,
    analysis: {
      source: enrichment ? "agent" : "heuristic",
      confidence: enrichment ? 0.86 : Math.min(0.78, 0.32 + signals.length * 0.09),
      languages: inferLanguages(signals),
      frameworks: inferFrameworks(signals),
      signals,
      projectKind: candidate.projectKind ?? "project",
      visibility: candidate.visibility ?? "default",
      layoutReasons: [
        ...(candidate.classificationReasons ?? []).slice(0, 3).map((detail) => ({ label: "classification", detail, weight: 0.18 })),
        { label: "domain", detail: `Classified as ${domain} from ${tags.slice(0, 4).join(", ") || "workspace signals"}.`, weight: 0.42 },
        { label: "substance", detail: `${signals.length} local signals detected.`, weight: substance }
      ]
    }
  };
}

function inferRelationships(projects, graphConfig) {
  const candidatePairs = indexedRelationshipPairs(projects);
  const relationships = [];
  for (const [left, right] of candidatePairs) {
    const evidence = relationshipEvidence(left, right);
    const strength = Math.min(0.95, evidence.reduce((sum, item) => sum + (item.weight ?? 0), 0));
    if (strength < 0.28) continue;
    relationships.push({
      id: `${left.id}-${right.id}`,
      source: left.id,
      target: right.id,
      kind: left.domain === right.domain ? "reference" : "inspired_by",
      label: evidence[0]?.detail ?? "related by workspace analysis",
      strength,
      sourceKind: "heuristic",
      evidence
    });
  }
  return capRelationships(
    relationships.sort((a, b) => b.strength - a.strength),
    graphConfig.maxRelationships,
    graphConfig.maxRelationshipsPerNode
  );
}

function indexedRelationshipPairs(projects) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const pairIds = new Set();
  const indexes = [new Map(), new Map(), new Map(), new Map()];
  for (const project of projects) {
    for (const tag of project.tags ?? []) addIndex(indexes[0], tag, project.id);
    addIndex(indexes[1], project.domain, project.id);
    for (const language of project.analysis?.languages ?? []) addIndex(indexes[2], language, project.id);
    addIndex(indexes[3], dirname(project.path), project.id);
  }
  for (const index of indexes) {
    for (const ids of index.values()) {
      if (ids.length < 2 || ids.length > Math.max(18, projects.length * 0.55)) continue;
      for (let left = 0; left < ids.length; left += 1) {
        for (let right = left + 1; right < ids.length; right += 1) {
          pairIds.add([ids[left], ids[right]].sort().join("\0"));
        }
      }
    }
  }
  return [...pairIds].map((pairId) => pairId.split("\0").map((id) => byId.get(id))).filter((pair) => pair[0] && pair[1]);
}

function addIndex(index, key, id) {
  if (!key) return;
  const ids = index.get(key) ?? [];
  ids.push(id);
  index.set(key, ids);
}

function capRelationships(relationships, maxRelationships, maxPerNode) {
  const counts = new Map();
  const kept = [];
  for (const relationship of relationships) {
    if (kept.length >= maxRelationships) break;
    const sourceCount = counts.get(relationship.source) ?? 0;
    const targetCount = counts.get(relationship.target) ?? 0;
    if (sourceCount >= maxPerNode || targetCount >= maxPerNode) continue;
    kept.push(relationship);
    counts.set(relationship.source, sourceCount + 1);
    counts.set(relationship.target, targetCount + 1);
  }
  return kept;
}

function relationshipEvidence(left, right) {
  const evidence = [];
  const tagOverlap = left.tags.filter((tag) => right.tags.includes(tag));
  if (tagOverlap.length) evidence.push({ label: "tag overlap", detail: `Shared tags: ${tagOverlap.slice(0, 5).join(", ")}`, weight: Math.min(0.36, tagOverlap.length * 0.08) });
  if (left.domain === right.domain) evidence.push({ label: "domain", detail: `Both classified as ${left.domain}.`, weight: 0.18 });
  const leftParent = dirname(left.path);
  const rightParent = dirname(right.path);
  if (leftParent === rightParent) evidence.push({ label: "path proximity", detail: `Both live under ${leftParent}.`, weight: 0.22 });
  const languageOverlap = (left.analysis?.languages ?? []).filter((language) => right.analysis?.languages?.includes(language));
  if (languageOverlap.length) evidence.push({ label: "language", detail: `Shared language signal: ${languageOverlap.join(", ")}`, weight: 0.16 });
  return evidence;
}

function classifyDomain(candidate, tags) {
  const text = `${candidate.name} ${candidate.path} ${tags.join(" ")}`.toLowerCase();
  if (text.includes("agent") || text.includes("codex") || text.includes("claude")) return "agentics";
  if (text.includes("memory") || text.includes("chat") || text.includes("thread")) return "memory";
  if (text.includes("dataset") || text.includes("corpus") || text.includes("archive")) return "corpus";
  if (text.includes("visual") || text.includes("three") || text.includes("graph") || text.includes("ui")) return "visualization";
  if (text.includes("research") || text.includes("paper") || text.includes("math") || text.includes("proof")) return "research";
  if (text.includes("infra") || text.includes("docker") || text.includes("service")) return "infrastructure";
  if (text.includes("writing") || text.includes("book") || text.includes("notes")) return "writing";
  return "operations";
}

function classifyTags(candidate) {
  const text = `${candidate.name} ${candidate.path} ${(candidate.signals ?? []).join(" ")}`.toLowerCase();
  const tags = [];
  for (const token of ["agent", "codex", "memory", "chat", "graph", "visual", "dataset", "research", "math", "tool", "react", "vite", "python", "rust", "tests"]) {
    if (text.includes(token)) tags.push(token);
  }
  return tags;
}

function purposeFrom(candidate, domain, signals) {
  return `Local ${domain} project detected from ${signals.join(", ") || "workspace"} signals. Agent enrichment can replace this with a precise human-readable purpose.`;
}

function nextMoveFrom(candidate, signals) {
  if (!signals.includes("README.md")) return "Ask an agent to inspect the root and draft a README-grade project purpose.";
  if (!signals.includes("tests")) return "Ask an agent to identify a minimal verification path for this project.";
  return "Ask an agent to confirm the current build/test command and choose the next smallest useful improvement.";
}

function scoreActivity(signals) {
  return clamp(0.28 + signals.length * 0.075 + (signals.includes("git") ? 0.12 : 0), 0.1, 0.94);
}

function scoreSubstance(signals) {
  return clamp(0.22 + signals.length * 0.09 + (signals.includes("tests") ? 0.14 : 0), 0.1, 0.96);
}

function inferLanguages(signals) {
  const languages = [];
  if (signals.includes("package.json")) languages.push("typescript/javascript");
  if (signals.includes("pyproject.toml")) languages.push("python");
  if (signals.includes("Cargo.toml")) languages.push("rust");
  return languages;
}

function inferFrameworks(signals) {
  return signals.includes("vite") ? ["vite"] : [];
}

function signalTag(signal) {
  return signal.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function readEnrichments(directory) {
  const enrichments = new Map();
  if (!existsSync(directory)) return enrichments;
  for (const file of readdirSync(directory)) {
    if (!file.endsWith(".json")) continue;
    try {
      const payload = JSON.parse(readFileSync(join(directory, file), "utf8"));
      if (payload.projectId) enrichments.set(payload.projectId, payload);
    } catch {
      // Ignore partial agent drafts until they become valid JSON.
    }
  }
  return enrichments;
}

function slug(name, path) {
  const base = (name || basename(path)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const tail = Math.abs(hash(path)).toString(36).slice(0, 5);
  return `${base || "project"}-${tail}`;
}

function hash(value) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(31, result) + value.charCodeAt(index);
  return result;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function publicProfile(profile) {
  return {
    id: profile.id,
    label: profile.label,
    deviceId: profile.deviceId,
    stateDir: profile.paths.stateDir
  };
}
