import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { describe, expect, it } from "vitest";

describe("workspace scan and analysis pipeline", () => {
  it("hides tooling/template candidates and keeps real projects visible", () => {
    const root = mkdtempSync(join(tmpdir(), "cognopticon-scan-"));
    const realProject = join(root, "real-project");
    const pyenvProject = join(root, ".pyenv", "plugins", "pyenv-doctor");
    const templateProject = join(root, "python-package-starter");
    createProject(realProject, "real-project");
    createProject(pyenvProject, "pyenv-doctor");
    createProject(templateProject, "your-package");

    const rawPath = join(root, "workspace.raw.json");
    const workspacePath = join(root, "workspace.json");
    runNode(["scripts/scan-workspace.mjs", "--roots", root, "--write", rawPath, "--review", join(root, "review.json")]);
    runNode(["scripts/analyze-workspace.mjs", "--input", rawPath, "--output", workspacePath]);

    const raw = JSON.parse(readFileSync(rawPath, "utf8"));
    const workspace = JSON.parse(readFileSync(workspacePath, "utf8"));

    expect(raw.candidates.some((candidate: { path: string; visibility: string }) => candidate.path === realProject && candidate.visibility === "default")).toBe(true);
    expect(raw.candidates.some((candidate: { path: string; projectKind: string; visibility: string }) => candidate.path === pyenvProject && candidate.projectKind === "tooling" && candidate.visibility === "hidden")).toBe(true);
    expect(raw.candidates.some((candidate: { path: string; projectKind: string; visibility: string }) => candidate.path === templateProject && candidate.projectKind === "template" && candidate.visibility === "hidden")).toBe(true);
    expect(workspace.projects.map((project: { path: string }) => project.path)).toContain(realProject);
    expect(workspace.projects.map((project: { path: string }) => project.path)).not.toContain(pyenvProject);
    expect(workspace.review.hiddenCandidates).toBeGreaterThanOrEqual(2);
  });

  it("keeps generated workspace state scoped to the active device profile", () => {
    const configRoot = mkdtempSync(join(tmpdir(), "cognopticon-profiles-"));
    const laptopRoot = join(configRoot, "laptop-projects");
    const desktopRoot = join(configRoot, "desktop-projects");
    createProject(join(laptopRoot, "laptop-tool"), "laptop-tool");
    createProject(join(desktopRoot, "desktop-tool"), "desktop-tool");

    runNode([scriptPath("scripts/local-init.mjs"), "--profile", "laptop-a", "--roots", laptopRoot], configRoot);
    runNode([scriptPath("scripts/scan-workspace.mjs"), "--profile-output"], configRoot, { COGNOPTICON_PROFILE: "laptop-a" });
    runNode([scriptPath("scripts/analyze-workspace.mjs"), "--profile-input", "--profile-output"], configRoot, { COGNOPTICON_PROFILE: "laptop-a" });

    runNode([scriptPath("scripts/local-init.mjs"), "--profile", "desktop", "--roots", desktopRoot], configRoot);
    runNode([scriptPath("scripts/scan-workspace.mjs"), "--profile-output"], configRoot, { COGNOPTICON_PROFILE: "desktop" });
    runNode([scriptPath("scripts/analyze-workspace.mjs"), "--profile-input", "--profile-output"], configRoot, { COGNOPTICON_PROFILE: "desktop" });

    const laptopWorkspace = JSON.parse(readFileSync(join(configRoot, ".cognopticon", "profiles", "laptop-a", "state", "workspace.json"), "utf8"));
    const desktopWorkspace = JSON.parse(readFileSync(join(configRoot, ".cognopticon", "profiles", "desktop", "state", "workspace.json"), "utf8"));

    expect(laptopWorkspace.profile.id).toBe("laptop-a");
    expect(desktopWorkspace.profile.id).toBe("desktop");
    expect(laptopWorkspace.projects.map((project: { path: string }) => project.path)).toContain(join(laptopRoot, "laptop-tool"));
    expect(laptopWorkspace.projects.map((project: { path: string }) => project.path)).not.toContain(join(desktopRoot, "desktop-tool"));
    expect(desktopWorkspace.projects.map((project: { path: string }) => project.path)).toContain(join(desktopRoot, "desktop-tool"));
    expect(desktopWorkspace.projects.map((project: { path: string }) => project.path)).not.toContain(join(laptopRoot, "laptop-tool"));

    const typo = spawnSync(process.execPath, [scriptPath("scripts/scan-workspace.mjs"), "--profile-output"], {
      cwd: configRoot,
      encoding: "utf8",
      env: { ...process.env, COGNOPTICON_PROFILE: "typo-profile" }
    });
    expect(typo.status).not.toBe(0);
    expect(typo.stderr).toContain('Unknown Cognopticon profile "typo-profile"');
  });

  it("fails closed when an env profile is requested before local init", () => {
    const configRoot = mkdtempSync(join(tmpdir(), "cognopticon-no-profile-"));
    const result = spawnSync(process.execPath, [scriptPath("scripts/scan-workspace.mjs"), "--profile-output"], {
      cwd: configRoot,
      encoding: "utf8",
      env: { ...process.env, COGNOPTICON_PROFILE: "typo-profile" }
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unknown Cognopticon profile "typo-profile"');
  });

  it("requires local init before writing profile-scoped scan output", () => {
    const configRoot = mkdtempSync(join(tmpdir(), "cognopticon-uninitialized-profile-"));
    createProject(join(configRoot, "local-tool"), "local-tool");

    const profileOutput = spawnSync(process.execPath, [scriptPath("scripts/scan-workspace.mjs"), "--profile-output"], {
      cwd: configRoot,
      encoding: "utf8",
      env: { ...process.env, COGNOPTICON_PROFILE: undefined }
    });
    expect(profileOutput.status).not.toBe(0);
    expect(profileOutput.stderr).toContain("Cognopticon local profile is not initialized");

    mkdirSync(join(configRoot, ".cognopticon"), { recursive: true });
    writeFileSync(join(configRoot, ".cognopticon", "config.json"), `${JSON.stringify({ allowedRoots: [configRoot] }, null, 2)}\n`, "utf8");
    const legacyConfig = spawnSync(process.execPath, [scriptPath("scripts/scan-workspace.mjs"), "--profile-output"], {
      cwd: configRoot,
      encoding: "utf8",
      env: { ...process.env, COGNOPTICON_PROFILE: undefined }
    });
    expect(legacyConfig.status).not.toBe(0);
    expect(legacyConfig.stderr).toContain("Cognopticon local profile is not initialized");

    const explicitOutput = join(configRoot, "workspace.raw.json");
    runNode([
      scriptPath("scripts/scan-workspace.mjs"),
      "--roots",
      configRoot,
      "--write",
      explicitOutput,
      "--review",
      join(configRoot, "review.json")
    ], configRoot, { COGNOPTICON_PROFILE: undefined });
    const raw = JSON.parse(readFileSync(explicitOutput, "utf8"));
    expect(raw.candidates.map((candidate: { path: string }) => candidate.path)).toContain(join(configRoot, "local-tool"));
  });

  it("requires explicit roots when initializing a local profile", () => {
    const configRoot = mkdtempSync(join(tmpdir(), "cognopticon-init-roots-"));
    const result = spawnSync(process.execPath, [scriptPath("scripts/local-init.mjs"), "--profile", "missing-roots"], {
      cwd: configRoot,
      encoding: "utf8",
      env: { ...process.env, COGNOPTICON_PROFILE: undefined }
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Missing required --roots");
  });

  it("fails closed when env or active profiles are not declared by local config", () => {
    const configRoot = mkdtempSync(join(tmpdir(), "cognopticon-legacy-profile-"));
    const projectRoot = join(configRoot, "projects");
    createProject(join(projectRoot, "local-tool"), "local-tool");
    mkdirSync(join(configRoot, ".cognopticon"), { recursive: true });
    writeFileSync(join(configRoot, ".cognopticon", "config.json"), `${JSON.stringify({ allowedRoots: [projectRoot] }, null, 2)}\n`, "utf8");

    const typo = spawnSync(process.execPath, [scriptPath("scripts/scan-workspace.mjs"), "--profile-output"], {
      cwd: configRoot,
      encoding: "utf8",
      env: { ...process.env, COGNOPTICON_PROFILE: "typo-profile" }
    });
    expect(typo.status).not.toBe(0);
    expect(typo.stderr).toContain('Unknown Cognopticon profile "typo-profile"');

    writeFileSync(join(configRoot, ".cognopticon", "config.json"), `${JSON.stringify({ activeProfile: "ghost", allowedRoots: [projectRoot] }, null, 2)}\n`, "utf8");
    const ghost = spawnSync(process.execPath, [scriptPath("scripts/scan-workspace.mjs"), "--profile-output"], {
      cwd: configRoot,
      encoding: "utf8",
      env: { ...process.env, COGNOPTICON_PROFILE: undefined }
    });
    expect(ghost.status).not.toBe(0);
    expect(ghost.stderr).toContain('Unknown Cognopticon profile "ghost"');
  });

  it("uses a declared singleton profile without falling back to default", () => {
    const configRoot = mkdtempSync(join(tmpdir(), "cognopticon-single-profile-"));
    const projectRoot = join(configRoot, "projects");
    createProject(join(projectRoot, "solo-tool"), "solo-tool");
    mkdirSync(join(configRoot, ".cognopticon"), { recursive: true });
    writeFileSync(join(configRoot, ".cognopticon", "config.json"), `${JSON.stringify({
      profile: { id: "solo", label: "Solo", allowedRoots: [projectRoot] }
    }, null, 2)}\n`, "utf8");

    runNode([scriptPath("scripts/scan-workspace.mjs"), "--profile-output"], configRoot, { COGNOPTICON_PROFILE: undefined });

    const raw = JSON.parse(readFileSync(join(configRoot, ".cognopticon", "profiles", "solo", "state", "workspace.raw.json"), "utf8"));
    expect(raw.profile.id).toBe("solo");
    expect(raw.roots).toEqual([projectRoot]);
  });

  it("fails closed when a declared profile has no roots", () => {
    const configRoot = mkdtempSync(join(tmpdir(), "cognopticon-rootless-profile-"));
    mkdirSync(join(configRoot, ".cognopticon"), { recursive: true });
    writeFileSync(join(configRoot, ".cognopticon", "config.json"), `${JSON.stringify({
      profiles: { rootless: { id: "rootless", label: "Rootless" } },
      activeProfile: "rootless"
    }, null, 2)}\n`, "utf8");

    const result = spawnSync(process.execPath, [scriptPath("scripts/scan-workspace.mjs"), "--profile-output"], {
      cwd: configRoot,
      encoding: "utf8",
      env: { ...process.env, COGNOPTICON_PROFILE: undefined }
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Cognopticon profile "rootless" must declare allowedRoots');
  });

  it("fails closed when profile path overrides escape the profile directory", () => {
    const configRoot = mkdtempSync(join(tmpdir(), "cognopticon-path-escape-"));
    const projectRoot = join(configRoot, "projects");
    createProject(join(projectRoot, "local-tool"), "local-tool");
    mkdirSync(join(configRoot, ".cognopticon"), { recursive: true });
    writeFileSync(join(configRoot, ".cognopticon", "config.json"), `${JSON.stringify({
      activeProfile: "laptop",
      profiles: {
        laptop: {
          id: "laptop",
          label: "Laptop",
          allowedRoots: [projectRoot],
          paths: { workspace: "../../public/workspace.json" }
        }
      }
    }, null, 2)}\n`, "utf8");

    const result = spawnSync(process.execPath, [scriptPath("scripts/scan-workspace.mjs"), "--profile-output"], {
      cwd: configRoot,
      encoding: "utf8",
      env: { ...process.env, COGNOPTICON_PROFILE: undefined }
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Cognopticon profile path "workspace" must stay under');
  });
});

function createProject(path: string, name: string) {
  mkdirSync(path, { recursive: true });
  mkdirSync(join(path, "src"), { recursive: true });
  writeFileSync(join(path, "README.md"), `# ${name}\n`, "utf8");
  writeFileSync(join(path, "package.json"), `${JSON.stringify({ name }, null, 2)}\n`, "utf8");
}

function runNode(args: string[], cwd = process.cwd(), env: Record<string, string | undefined> = {}) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  expect(result.status, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(0);
}

function scriptPath(path: string) {
  return resolve(process.cwd(), path);
}
