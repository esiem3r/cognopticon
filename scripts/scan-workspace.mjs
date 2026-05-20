#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import roots from "../src/data/workspace-roots.json" with { type: "json" };

const maxDepth = Number(process.env.COGNOPTICON_SCAN_DEPTH ?? 3);
const outputPath = process.argv.includes("--write")
  ? process.argv[process.argv.indexOf("--write") + 1] || "workspace-scan.json"
  : null;

const candidates = [];
const seen = new Set();

for (const root of roots) {
  walk(root, 0);
}

const payload = {
  generatedAt: new Date().toISOString(),
  roots,
  candidates: candidates
    .sort((a, b) => b.signals.length - a.signals.length || a.path.localeCompare(b.path))
    .slice(0, 120)
};

if (outputPath) {
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
} else {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function walk(directory, depth) {
  if (depth > maxDepth || !existsSync(directory)) return;
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  const names = new Set(entries.map((entry) => entry.name));
  const signals = [];
  if (names.has(".git")) signals.push("git");
  if (names.has("package.json")) signals.push("package.json");
  if (names.has("pyproject.toml")) signals.push("pyproject.toml");
  if (names.has("Cargo.toml")) signals.push("Cargo.toml");
  if (names.has("README.md")) signals.push("README.md");
  if (names.has("vite.config.ts") || names.has("vite.config.js")) signals.push("vite");
  if (names.has("src")) signals.push("src");
  if (names.has("tests")) signals.push("tests");

  if (signals.length >= 2 && !seen.has(directory)) {
    seen.add(directory);
    candidates.push({
      name: packageName(directory) ?? basename(directory),
      path: directory,
      signals,
      packageName: packageName(directory)
    });
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (shouldSkip(entry.name)) continue;
    walk(join(directory, entry.name), depth + 1);
  }
}

function shouldSkip(name) {
  return [
    ".cache",
    ".git",
    ".mypy_cache",
    ".next",
    ".pytest_cache",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "site-packages"
  ].includes(name);
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
