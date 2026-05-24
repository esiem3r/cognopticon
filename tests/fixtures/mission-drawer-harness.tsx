/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MissionDrawer } from "../../src/components/MissionDrawer";
import { renderMissionPacketMarkdown } from "../../src/lib/missionPacket";
import type { MissionBrief, ProjectDossier } from "../../src/types/cognopticon";
import "../../src/styles.css";

const generatedAt = "2026-05-24T06:10:00.000Z";
const project: ProjectDossier = {
  id: "drawer-harness",
  name: "Drawer Harness",
  path: "/demo/workspace/drawer-harness",
  status: "active",
  health: "strong",
  domain: "agentics",
  activity: 0.8,
  substance: 0.7,
  position: { x: 0, y: 0 },
  purpose: "Exercise mission drawer packet delivery controls.",
  whyItMatters: "It proves malformed packets fail closed in the browser.",
  currentFriction: "Harness only.",
  nextMove: "Render the mission drawer.",
  decision: "build",
  decisionRationale: "Browser proof covers the handoff boundary.",
  nextReview: "2026-05-24",
  missionConstraints: ["Use sanitized demo paths only."],
  evidence: [{ label: "Harness", path: "/demo/workspace/drawer-harness/package.json", kind: "file" }],
  tags: ["test", "mission"]
};

function Harness() {
  const [reviewed, setReviewed] = useState(false);
  const mode = new URLSearchParams(window.location.search).get("mode");
  const brief: MissionBrief = {
    projectId: project.id,
    generatedAt,
    markdown: mode === "invalid" ? "# Mission Brief: Drawer Harness\n\nNo structured packet." : validMarkdown()
  };

  return (
    <MissionDrawer
      brief={brief}
      project={project}
      dispatchStatus={reviewed ? "reviewed" : "awaiting_approval"}
      dispatchSummary={reviewed ? "Mission reviewed." : undefined}
      onMarkReviewed={() => setReviewed(true)}
      onClose={() => undefined}
    />
  );
}

function validMarkdown() {
  return renderMissionPacketMarkdown({
    id: `mission:${project.id}:${generatedAt}`,
    source: "project",
    projectIds: [project.id],
    title: `Mission Brief: ${project.name}`,
    objective: project.nextMove,
    generatedAt,
    contextSummary: project.purpose,
    currentState: `${project.decision}: ${project.decisionRationale}`,
    relevantFiles: [project.path, ...project.evidence.map((item) => item.path)],
    excludedFiles: ["node_modules", ".cognopticon"],
    knownRisks: [project.currentFriction],
    constraints: project.missionConstraints,
    acceptanceCriteria: ["The final handoff includes verification evidence."],
    firstActions: ["Inspect the sanitized demo fixture."],
    verificationCommands: ["npm test"],
    authority: {
      mayRead: [project.path],
      mayEdit: [],
      mayRun: ["npm test"],
      requiresApproval: ["file edits", "network access"]
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>
);
