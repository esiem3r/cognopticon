import metadata from "../data/workspace-meta.json";
import projects from "../data/projects.json";
import relationships from "../data/relationships.json";
import roots from "../data/workspace-roots.json";
import type { CognopticonWorkspace } from "../types/cognopticon";
import { ensureWorkspaceCore } from "./workspaceCore";

export const sampleWorkspace = {
  ...metadata,
  roots,
  projects,
  relationships
} as CognopticonWorkspace;

export async function loadWorkspace(fetcher: typeof fetch = fetch): Promise<CognopticonWorkspace> {
  try {
    const daemonResponse = await fetcher("/api/workspace", { cache: "no-store" });
    if (daemonResponse.ok) {
      const workspace = await daemonResponse.json() as CognopticonWorkspace;
      if (Array.isArray(workspace.projects) && Array.isArray(workspace.relationships)) return ensureWorkspaceCore(workspace);
    }
  } catch {
    // Vite/static mode does not expose the daemon API.
  }
  return ensureWorkspaceCore(sampleWorkspace);
}
