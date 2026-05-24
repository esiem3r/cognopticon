#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { normalizeProfile, normalizeProfileId } from "./runtime-config.mjs";

const rootsArg = argValue("--roots");
if (!rootsArg) {
  console.error('Missing required --roots "/path/to/projects,/another/root".');
  process.exit(1);
}
const roots = rootsArg.split(",").map((root) => resolve(root.trim())).filter(Boolean);
if (!roots.length) {
  console.error('At least one --roots entry is required.');
  process.exit(1);
}
const profileId = normalizeProfileId(argValue("--profile") ?? hostname());
const existing = existsSync(".cognopticon/config.json") ? JSON.parse(readFileSync(".cognopticon/config.json", "utf8")) : {};
const profile = normalizeProfile(process.cwd(), profileId, {
  id: profileId,
  label: argValue("--label") ?? profileId,
  deviceId: normalizeProfileId(hostname()),
  allowedRoots: roots,
  createdAt: existing.profiles?.[profileId]?.createdAt ?? new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
mkdirSync(profile.paths.stateDir, { recursive: true });
mkdirSync(profile.paths.enrichments, { recursive: true });
mkdirSync(profile.paths.missions, { recursive: true });
mkdirSync(profile.paths.loops, { recursive: true });
const config = {
  ...existing,
  host: "127.0.0.1",
  port: 8787,
  activeProfile: profileId,
  profiles: {
    ...(existing.profiles ?? {}),
    [profileId]: {
      id: profile.id,
      label: profile.label,
      deviceId: profile.deviceId,
      allowedRoots: roots,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    }
  },
  allowedCommands: ["npm", "node"],
  allowedOrigins: [
    "http://127.0.0.1:8787",
    "http://localhost:8787",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175"
  ],
  daemon: {
    ...(existing.daemon ?? {}),
    accessToken: existing.daemon?.accessToken ?? randomBytes(24).toString("base64url")
  },
  editorCommand: "code",
  createdAt: existing.createdAt ?? new Date().toISOString(),
  updatedAt: new Date().toISOString()
};
writeFileSync(".cognopticon/config.json", `${JSON.stringify(config, null, 2)}\n`, "utf8");
writeFileSync(profile.paths.events, "", { flag: "a" });
console.log(`Initialized Cognopticon profile "${profileId}" for ${roots.length} root(s).`);

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
