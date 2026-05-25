import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(".");
const tempRoots = [];

afterEach(() => {
  for (const path of tempRoots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("enrichment packet generator", () => {
  it("writes private packets only under the active profile tree", () => {
    const root = createFixture();
    const result = runEnrichment(root);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const packetPath = join(root, ".cognopticon", "profiles", "personal", "missions", "private-alpha-6fkbn.md");
    const packet = readFileSync(packetPath, "utf8");
    expect(packet).toContain("Cognopticon Agent Packet: private-alpha");
    expect(packet).toContain(join(root, "real-work", "private-alpha"));
    expect(packet).toContain(join(root, ".cognopticon", "profiles", "personal", "enrichments", "private-alpha-6fkbn.json"));
  });

  it("rejects mission and enrichment output outside the private profile tree", () => {
    const root = createFixture();

    const publicOutput = runEnrichment(root, ["--output", join(root, "docs")]);
    expect(publicOutput.status).toBe(1);
    expect(publicOutput.stderr).toContain("mission packet output directory must stay under");
    expect(existsSync(join(root, "docs", "private-alpha-6fkbn.md"))).toBe(false);

    const publicEnrichments = runEnrichment(root, ["--enrichments", join(root, "docs")]);
    expect(publicEnrichments.status).toBe(1);
    expect(publicEnrichments.stderr).toContain("enrichment output directory must stay under");
  });

  it("rejects unsafe project ids and non-active-profile workspace input", () => {
    const root = createFixture();
    const stateDir = join(root, ".cognopticon", "profiles", "personal", "state");
    const unsafeInput = join(stateDir, "unsafe-workspace.json");
    writeWorkspace(root, unsafeInput, { id: "../../docs/private-alpha", profileId: "personal" });

    const unsafe = runEnrichment(root, ["--input", unsafeInput]);
    expect(unsafe.status).toBe(1);
    expect(unsafe.stderr).toContain("Unsafe project id");
    expect(existsSync(join(root, "docs", "private-alpha.md"))).toBe(false);

    const outsideInput = join(root, "outside-workspace.json");
    writeWorkspace(root, outsideInput, { id: "private-alpha-6fkbn", profileId: "personal" });
    const outside = runEnrichment(root, ["--input", outsideInput]);
    expect(outside.status).toBe(1);
    expect(outside.stderr).toContain("workspace input path must stay under");

    const wrongProfileInput = join(stateDir, "wrong-profile-workspace.json");
    writeWorkspace(root, wrongProfileInput, { id: "private-alpha-6fkbn", profileId: "other-profile" });
    const wrongProfile = runEnrichment(root, ["--input", wrongProfileInput]);
    expect(wrongProfile.status).toBe(1);
    expect(wrongProfile.stderr).toContain("does not match active profile");
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "cognopticon-enrichment-packets-test-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "src", "data"), { recursive: true });
  for (const scriptFile of ["enrichment-packets.mjs", "runtime-config.mjs"]) {
    cpSync(join(repoRoot, "scripts", scriptFile), join(root, "scripts", scriptFile));
  }
  cpSync(join(repoRoot, "src", "data", "workspace-roots.json"), join(root, "src", "data", "workspace-roots.json"));

  const projectPath = join(root, "real-work", "private-alpha");
  const stateDir = join(root, ".cognopticon", "profiles", "personal", "state");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(projectPath, { recursive: true });
  writeWorkspace(root, join(stateDir, "workspace.json"), { id: "private-alpha-6fkbn", profileId: "personal" });
  writeFileSync(join(root, ".cognopticon", "config.json"), `${JSON.stringify({
    activeProfile: "personal",
    profiles: {
      personal: {
        id: "personal",
        label: "Personal",
        allowedRoots: [join(root, "real-work")]
      }
    }
  }, null, 2)}\n`, "utf8");
  return root;
}

function writeWorkspace(root, path, { id, profileId }) {
  const projectPath = join(root, "real-work", "private-alpha");
  const stateDir = join(root, ".cognopticon", "profiles", "personal", "state");
  writeFileSync(path, `${JSON.stringify({
    generatedAt: "2026-05-25T00:00:00.000Z",
    title: "Private Workspace",
    profile: {
      id: profileId,
      stateDir
    },
    roots: [join(root, "real-work")],
    projects: [{
      id,
      name: "private-alpha",
      path: projectPath,
      domain: "operations",
      analysis: {
        signals: ["git", "package.json"]
      }
    }],
    relationships: []
  }, null, 2)}\n`, "utf8");
}

function runEnrichment(root, args = []) {
  return spawnSync(process.execPath, ["scripts/enrichment-packets.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    env: childEnv(root)
  });
}

function childEnv(root) {
  return {
    ...process.env,
    HOME: root,
    USERPROFILE: root,
    TMPDIR: root,
    TMP: root,
    TEMP: root,
    CI: process.env.CI ?? "1",
    FORCE_COLOR: "0"
  };
}
