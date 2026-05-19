import projects from "../data/projects.json";
import relationships from "../data/relationships.json";
import type { ProjectDossier, ProjectRelationship } from "../types/cosmopticon";

export const projectDossiers = projects as ProjectDossier[];
export const projectRelationships = relationships as ProjectRelationship[];

export function getProjectById(id: string) {
  return projectDossiers.find((project) => project.id === id);
}
