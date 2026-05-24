#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { opendir } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import roots from "../src/data/workspace-roots.json" with { type: "json" };
import { loadRuntimeConfig } from "./runtime-config.mjs";

const profileOutputRequested = hasFlag("--profile-output");
const runtimeConfig = loadRuntimeConfig(process.cwd(), { requireInitialized: profileOutputRequested });
const outputPath = argValue("--write") ?? (profileOutputRequested ? runtimeConfig.profile.paths.rawWorkspace : undefined);
const reviewPath = argValue("--review") ?? (profileOutputRequested ? runtimeConfig.profile.paths.review : undefined);
const rootsFlag = argValue("--roots");
const scanRoots = rootsFlag ? parseRoots(rootsFlag) : defaultScanRoots(runtimeConfig);

const payload = await scanWorkspace(scanRoots, runtimeConfig.scan, runtimeConfig.profile);

if (outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  if (reviewPath) writeReviewFile(reviewPath, payload);
} else {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export async function scanWorkspace(scanRoots, config = runtimeConfig.scan, profile = runtimeConfig.profile) {
  const candidates = [];
  const seen = new Set();
  const rootsToScan = scanRoots.map((root) => resolve(root));
  const queue = rootsToScan.map((directory) => ({ directory, depth: 0, root: directory }));
  let active = 0;

  await new Promise((done) => {
    const pump = () => {
      while (active < Math.max(1, config.concurrency) && queue.length) {
        const item = queue.shift();
        active += 1;
        walk(item, config, seen, candidates, queue).finally(() => {
          active -= 1;
          pump();
        });
      }
      if (active === 0 && queue.length === 0) done();
    };
    pump();
  });

  const withDuplicates = markDuplicates(candidates);
  const sorted = withDuplicates
    .sort((a, b) => visibilityRank(a) - visibilityRank(b) || b.signals.length - a.signals.length || a.path.localeCompare(b.path))
    .slice(0, config.maxCandidates);

  return {
    generatedAt: new Date().toISOString(),
    profile: publicProfile(profile),
    roots: rootsToScan,
    config: {
      maxDepth: config.maxDepth,
      maxCandidates: config.maxCandidates,
      concurrency: config.concurrency,
      hiddenKinds: config.hiddenKinds
    },
    candidates: sorted,
    review: sorted.filter((candidate) => candidate.visibility !== "default")
  };
}

async function walk(item, config, seen, candidates, queue) {
  const { directory, depth, root } = item;
  if (depth > config.maxDepth || !existsSync(directory)) return;
  let entries;
  try {
    const dir = await opendir(directory);
    entries = [];
    for await (const entry of dir) entries.push(entry);
  } catch {
    return;
  }

  const names = new Set(entries.map((entry) => entry.name));
  const signals = projectSignals(names);
  if (signals.length >= 2 && !seen.has(directory)) {
    seen.add(directory);
    const candidate = buildCandidate(directory, root, signals, config);
    candidates.push(candidate);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (shouldSkip(entry.name, directory)) continue;
    queue.push({ directory: join(directory, entry.name), depth: depth + 1, root });
  }
}

function projectSignals(names) {
  const signals = [];
  if (names.has(".git")) signals.push("git");
  if (names.has("package.json")) signals.push("package.json");
  if (names.has("pyproject.toml")) signals.push("pyproject.toml");
  if (names.has("Cargo.toml")) signals.push("Cargo.toml");
  if (names.has("README.md")) signals.push("README.md");
  if (names.has("vite.config.ts") || names.has("vite.config.js")) signals.push("vite");
  if (names.has("src")) signals.push("src");
  if (names.has("tests")) signals.push("tests");
  return signals;
}

function buildCandidate(directory, root, signals, config) {
  const name = packageName(directory) ?? basename(directory);
  const projectKind = classifyProjectKind(directory, root, signals);
  const visibility = config.hiddenKinds.includes(projectKind) ? "hidden" : projectKind === "unknown" ? "needs_review" : "default";
  return {
    name,
    path: directory,
    relativePath: relative(root, directory) || ".",
    signals,
    packageName: packageName(directory),
    projectKind,
    visibility,
    classificationReasons: classificationReasons(directory, signals, projectKind)
  };
}

function classifyProjectKind(directory, root, signals) {
  const text = directory.toLowerCase();
  const base = basename(directory).toLowerCase();
  const relativePath = relative(root, directory).toLowerCase();
  if (/(^|[\\/])(node_modules|site-packages|vendor|target|dist|build)([\\/]|$)/.test(text)) return "dependency";
  if (/(^|[\\/])(\.pyenv|nvm|\.nvm|\.vscode|\.vscode-server|pyenv-[^\\/]+)([\\/]|$)/.test(text) || base === "code") return "tooling";
  if (/(^|[\\/])(\.codex[\\/]\.tmp|\.cache|\.local|appdata)([\\/]|$)/.test(text)) return "tooling";
  if (/(starter|template|boilerplate|your-package|example)/.test(base) || /(^|[\\/])_templates([\\/]|$)/.test(relativePath) || /package-starter/.test(relativePath)) return "template";
  if (/(^|[\\/_-])(backup|archive|old|copy)([\\/_-]|$)/.test(relativePath) || /(^|[-_])(backup|archive|old|copy)([-_]|$)/.test(base)) return "archive";
  if (signals.includes("package.json") || signals.includes("pyproject.toml") || signals.includes("Cargo.toml") || signals.includes("git")) return "project";
  return "unknown";
}

function classificationReasons(directory, signals, projectKind) {
  const reasons = [`${signals.length} structural signal(s): ${signals.join(", ")}`];
  if (projectKind !== "project") reasons.push(`classified as ${projectKind} from path/name heuristics`);
  if (signals.includes("git")) reasons.push("contains git metadata");
  return reasons;
}

function markDuplicates(candidates) {
  const byCanonical = new Map();
  for (const candidate of candidates) {
    const key = canonicalName(candidate.name);
    const current = byCanonical.get(key);
    if (!current || candidateScore(candidate) > candidateScore(current)) byCanonical.set(key, candidate);
  }
  return candidates.map((candidate) => {
    const canonical = byCanonical.get(canonicalName(candidate.name));
    if (canonical === candidate) return candidate;
    return {
      ...candidate,
      projectKind: "duplicate",
      visibility: "hidden",
      duplicateOf: canonical.id ?? canonical.path,
      classificationReasons: [...candidate.classificationReasons, `duplicate-like name; preferred ${canonical.path}`]
    };
  });
}

function candidateScore(candidate) {
  return candidate.signals.length + (candidate.signals.includes("git") ? 2 : 0) + (candidate.signals.includes("tests") ? 1 : 0) + candidate.relativePath.split(/[\\/]/).length * 0.05;
}

function canonicalName(name) {
  return String(name).toLowerCase().replace(/(?:[-_ ]?(backup|copy|old|src|source|main|v\d+))+$/g, "").replace(/[^a-z0-9]+/g, "");
}

function visibilityRank(candidate) {
  if (candidate.visibility === "default") return 0;
  if (candidate.visibility === "needs_review") return 1;
  return 2;
}

function shouldSkip(name, parent) {
  const lower = name.toLowerCase();
  if ([
    ".cache",
    ".git",
    ".mypy_cache",
    ".next",
    ".pytest_cache",
    ".venv",
    "venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "site-packages",
    "target"
  ].includes(lower)) return true;
  const full = join(parent, name).toLowerCase();
  return /([\\/])(\.local|appdata|cache)([\\/]|$)/.test(full);
}

function packageName(directory) {
  const packagePath = join(directory, "package.json");
  if (existsSync(packagePath)) {
    try {
      return JSON.parse(readFileSync(packagePath, "utf8")).name;
    } catch {
      return undefined;
    }
  }
  const pyprojectPath = join(directory, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    try {
      const text = readFileSync(pyprojectPath, "utf8");
      const match = text.match(/^\s*name\s*=\s*"([^"]+)"/m);
      if (match) return match[1];
    } catch {
      return undefined;
    }
  }
  try {
    if (statSync(directory).isDirectory()) return undefined;
  } catch {
    return undefined;
  }
  return undefined;
}

function writeReviewFile(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ generatedAt: payload.generatedAt, profile: payload.profile, review: payload.review }, null, 2)}\n`, "utf8");
}

function defaultScanRoots(config) {
  if (Array.isArray(config.scan.roots) && config.scan.roots.length) return config.scan.roots;
  const placeholderRoots = roots.every((root) => root.startsWith("/demo/") || root.includes("/path/to/"));
  if (placeholderRoots && Array.isArray(config.allowedRoots) && config.allowedRoots.length) return config.allowedRoots;
  return roots;
}

function parseRoots(value) {
  return value.split(",").map((root) => root.trim()).filter(Boolean);
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function publicProfile(profile) {
  return {
    id: profile.id,
    label: profile.label,
    deviceId: profile.deviceId,
    stateDir: profile.paths.stateDir
  };
}
