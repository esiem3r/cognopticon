import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve, sep } from "node:path";

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

export function loadRuntimeConfig(root = process.cwd(), options = {}) {
  const configPath = options.configPath === false ? undefined : resolve(root, options.configPath ?? ".cognopticon/config.json");
  const hasLocalConfig = Boolean(configPath && existsSync(configPath));
  const local = hasLocalConfig ? JSON.parse(readFileSync(configPath, "utf8")) : {};
  const hasProfileDeclaration = hasDeclaredProfile(local);
  const merged = mergeConfig(defaultRuntimeConfig, local);
  merged.initialized = hasProfileDeclaration;
  const envProfile = process.env.COGNOPTICON_PROFILE;
  const configuredActiveProfile = local.activeProfile ?? local.profile?.id;
  const activeProfileId = normalizeProfileId(envProfile ?? configuredActiveProfile ?? merged.activeProfile ?? "default");
  if (envProfile && !hasLocalConfig) throw unknownProfileError(activeProfileId);
  if (envProfile && !hasProfileDeclaration) throw unknownProfileError(activeProfileId);
  if (options.requireInitialized && !hasProfileDeclaration) {
    if (configuredActiveProfile && activeProfileId !== "default") throw unknownProfileError(activeProfileId);
    throw uninitializedProfileError();
  }
  const profileInput = profileConfigFor(merged, activeProfileId, { envProfileRequested: Boolean(envProfile) });
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
  const defaultPaths = {
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
    paths: normalizeProfilePaths(root, profileRoot, defaultPaths, profile.paths)
  };
}

function profileConfigFor(config, id, options = {}) {
  const configuredProfiles = config.profiles && Object.keys(config.profiles).length ? config.profiles : undefined;
  if (configuredProfiles && !configuredProfiles[id]) {
    throw unknownProfileError(id);
  }
  const singletonProfileId = config.profile?.id ? normalizeProfileId(config.profile.id) : undefined;
  if (singletonProfileId && singletonProfileId !== id) throw unknownProfileError(id);
  if (!configuredProfiles && !singletonProfileId && id !== "default" && (options.envProfileRequested || normalizeProfileId(config.activeProfile) === id)) {
    throw unknownProfileError(id);
  }
  const declared = configuredProfiles?.[id] ?? (singletonProfileId === id ? config.profile : {});
  const legacyAllowedRoots = Array.isArray(config.allowedRoots) ? config.allowedRoots : [];
  const scanRoots = Array.isArray(config.scan?.roots) ? config.scan.roots : [];
  const profile = mergeConfig({
    id,
    label: id,
    deviceId: normalizeProfileId(hostname()),
    allowedRoots: legacyAllowedRoots.length ? legacyAllowedRoots : scanRoots
  }, declared);
  if ((configuredProfiles || singletonProfileId) && (!Array.isArray(profile.allowedRoots) || profile.allowedRoots.length === 0)) {
    throw new Error(`Cognopticon profile "${id}" must declare allowedRoots. Run npm run local:init -- --profile "${id}" --roots "/path/to/projects" first.`);
  }
  return profile;
}

function unknownProfileError(id) {
  return new Error(`Unknown Cognopticon profile "${id}". Run npm run local:init -- --profile "${id}" --roots "/path/to/projects" first.`);
}

function uninitializedProfileError() {
  return new Error('Cognopticon local profile is not initialized. Run npm run local:init -- --profile "<profile>" --roots "/path/to/projects" first.');
}

function normalizeProfilePaths(root, profileRoot, defaultPaths, overrides = {}) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return defaultPaths;
  const paths = { ...defaultPaths };
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in defaultPaths)) throw new Error(`Unsupported Cognopticon profile path override: ${key}`);
    if (key === "rootDir") throw new Error("Cognopticon profile rootDir cannot be overridden; profile state must stay under .cognopticon/profiles/<profile>.");
    if (typeof value !== "string" || !value.trim()) throw new Error(`Cognopticon profile path "${key}" must be a non-empty string.`);
    const resolved = value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) ? resolve(value) : resolve(profileRoot, value);
    if (!isInside(resolved, profileRoot)) {
      throw new Error(`Cognopticon profile path "${key}" must stay under ${profileRoot}.`);
    }
    paths[key] = resolved;
  }
  return paths;
}

function isInside(target, root) {
  const resolvedTarget = resolve(target);
  const resolvedRoot = resolve(root);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${sep}`);
}

function hasDeclaredProfile(config) {
  return Boolean(config?.profile?.id || config?.profiles && Object.keys(config.profiles).length);
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
