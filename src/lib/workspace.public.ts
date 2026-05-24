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

export async function loadWorkspace(): Promise<CognopticonWorkspace> {
  return ensureWorkspaceCore(sampleWorkspace);
}
