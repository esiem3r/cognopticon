import { sampleWorkspace } from "./workspace";

export function getProjectById(id: string) {
  return sampleWorkspace.projects.find((project) => project.id === id);
}

export const projectDossiers = sampleWorkspace.projects;
export const projectRelationships = sampleWorkspace.relationships;
