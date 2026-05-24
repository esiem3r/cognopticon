import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";

export const defaultRuntimeConfig = {
  activeProfile: "default",
  profiles: {},
  scan: {
    maxDepth: 4,
    maxCandidates: 240,
    maxProjects: 64,
    concurrency: 8,
    hiddenKinds: ["dependency", "tooling", "template", "archive", "duplicate", "parent"]
  },
  graph: {
    maxRelationships: 160,
    maxRelationshipsPerNode: 8
  },
  agents: {
    maxRootAgents: 4,
    maxThreads: 8,
    maxDepth: 2,
    maxChildrenPerAgent: 2,
    maxTotalAgents: 16,
    maxRuntimeMs: 900000,
    maxRetries: 1
  }
};

export function loadRuntimeConfig(root = process.cwd()) {
  const configPath = resolve(root, ".cognopticon", "config.json");
  const local = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
  const merged = mergeConfig(defaultRuntimeConfig, local);
  const envProfile = process.env.COGNOPTICON_PROFILE;
  if (envProfile && !existsSync(configPath)) {
    throw new Error(`Unknown Cognopticon profile "${normalizeProfileId(envProfile)}". Run npm run local:init -- --profile "${normalizeProfileId(envProfile)}" --roots "/path/to/projects" first.`);
  }
  const activeProfileId = normalizeProfileId(envProfile ?? merged.activeProfile ?? merged.profile?.id ?? "default");
  const profileInput = profileConfigFor(merged, activeProfileId);
  merged.activeProfile = activeProfileId;
  merged.profile = normalizeProfile(root, activeProfileId, profileInput);
  merged.scan.maxDepth = numberFromEnv("COGNOPTICON_SCAN_DEPTH", merged.scan.maxDepth);
  merged.scan.maxCandidates = numberFromEnv("COGNOPTICON_SCAN_CANDIDATE_LIMIT", merged.scan.maxCandidates);
  merged.scan.maxProjects = numberFromEnv("COGNOPTICON_PROJECT_LIMIT", merged.scan.maxProjects);
  merged.scan.concurrency = numberFromEnv("COGNOPTICON_SCAN_THREADS", merged.scan.concurrency);
  merged.graph.maxRelationships = numberFromEnv("COGNOPTICON_RELATIONSHIP_LIMIT", merged.graph.maxRelationships);
  merged.graph.maxRelationshipsPerNode = numberFromEnv("COGNOPTICON_RELATIONSHIPS_PER_NODE", merged.graph.maxRelationshipsPerNode);
  merged.agents.maxThreads = numberFromEnv("COGNOPTICON_AGENT_THREADS", merged.agents.maxThreads);
  merged.agents.maxDepth = numberFromEnv("COGNOPTICON_AGENT_DEPTH", merged.agents.maxDepth);
  if (!Array.isArray(merged.scan.roots) || merged.scan.roots.length === 0) merged.scan.roots = merged.profile.allowedRoots;
  return merged;
}

export function normalizeProfileId(value) {
  const normalized = String(value ?? "default").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || "default";
}

export function normalizeProfile(root, id, profile = {}) {
  const safeId = normalizeProfileId(id);
  const profileRoot = resolve(root, ".cognopticon", "profiles", safeId);
  const allowedRoots = Array.isArray(profile.allowedRoots) && profile.allowedRoots.length
    ? profile.allowedRoots.map((allowedRoot) => resolve(root, allowedRoot))
    : [resolve(root)];
  const paths = {
    rootDir: profileRoot,
    stateDir: join(profileRoot, "state"),
    rawWorkspace: join(profileRoot, "state", "workspace.raw.json"),
    workspace: join(profileRoot, "state", "workspace.json"),
    review: join(profileRoot, "state", "scan-review.json"),
    events: join(profileRoot, "state", "events.jsonl"),
    enrichments: join(profileRoot, "enrichments"),
    missions: join(profileRoot, "missions"),
    loops: join(profileRoot, "loops")
  };
  return {
    ...profile,
    id: safeId,
    label: profile.label ?? safeId,
    deviceId: profile.deviceId ?? normalizeProfileId(hostname()),
    allowedRoots,
    paths: { ...paths, ...(profile.paths ?? {}) }
  };
}

function profileConfigFor(config, id) {
  const configuredProfiles = config.profiles && Object.keys(config.profiles).length ? config.profiles : undefined;
  if (configuredProfiles && !configuredProfiles[id]) {
    throw new Error(`Unknown Cognopticon profile "${id}". Run npm run local:init -- --profile "${id}" --roots "/path/to/projects" first.`);
  }
  const declared = configuredProfiles?.[id] ?? (config.profile?.id === id ? config.profile : {});
  const legacyAllowedRoots = Array.isArray(config.allowedRoots) ? config.allowedRoots : [];
  const scanRoots = Array.isArray(config.scan?.roots) ? config.scan.roots : [];
  return mergeConfig({
    id,
    label: id,
    deviceId: normalizeProfileId(hostname()),
    allowedRoots: legacyAllowedRoots.length ? legacyAllowedRoots : scanRoots
  }, declared);
}

export function mergeConfig(base, override) {
  const result = structuredClone(base);
  for (const [section, value] of Object.entries(override ?? {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && result[section] && typeof result[section] === "object" && !Array.isArray(result[section])) {
      result[section] = { ...(result[section] ?? {}), ...value };
    } else {
      result[section] = value;
    }
  }
  return result;
}

function numberFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
