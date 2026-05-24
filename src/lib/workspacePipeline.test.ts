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
