export interface MissionPacketAuthority {
  mayRead: string[];
  mayEdit: string[];
  mayRun: string[];
  requiresApproval: string[];
}

export interface MissionPacketInput {
  id: string;
  source: "project" | "proposal";
  projectIds: string[];
  title: string;
  objective: string;
  generatedAt: string;
  contextSummary: string;
  currentState: string;
  relevantFiles: string[];
  excludedFiles: string[];
  knownRisks: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  firstActions: string[];
  verificationCommands: string[];
  authority: MissionPacketAuthority;
  sections?: Array<{ heading: string; body: string | string[] }>;
}

export function renderMissionPacketMarkdown(input: MissionPacketInput) {
  const packet = {
    version: 1,
    source: input.source,
    id: input.id,
    projectIds: unique(input.projectIds),
    title: input.title,
    objective: input.objective,
    generatedAt: input.generatedAt,
    context: {
      summary: input.contextSummary,
      currentState: input.currentState,
      relevantFiles: unique(input.relevantFiles),
      excludedFiles: unique(input.excludedFiles),
      knownRisks: unique(input.knownRisks)
    },
    constraints: unique(input.constraints),
    acceptanceCriteria: unique(input.acceptanceCriteria),
    verificationCommands: unique(input.verificationCommands),
    authority: {
      mayRead: unique(input.authority.mayRead),
      mayEdit: unique(input.authority.mayEdit),
      mayRun: unique(input.authority.mayRun),
      requiresApproval: unique(input.authority.requiresApproval)
    }
  };

  return [
    `# ${input.title}`,
    "",
    `Generated: ${input.generatedAt}`,
    "",
    "## Objective",
    input.objective,
    "",
    "## Handoff Packet",
    "```json",
    JSON.stringify(packet, null, 2),
    "```",
    "",
    "## Context",
    input.contextSummary,
    "",
    "## Relevant Files",
    ...listOrFallback(packet.context.relevantFiles, "No relevant files recorded."),
    "",
    "## Excluded Files",
    ...listOrFallback(packet.context.excludedFiles, "No exclusions recorded."),
    "",
    "## Constraints",
    ...listOrFallback(packet.constraints, "No constraints recorded."),
    "",
    "## Acceptance Criteria",
    ...listOrFallback(packet.acceptanceCriteria, "No acceptance criteria recorded."),
    "",
    "## Verification Commands",
    ...listOrFallback(packet.verificationCommands, "No verification command inferred; document the verification blocker."),
    "",
    "## Authority",
    ...authorityLines(packet.authority),
    "",
    "## First Actions",
    ...listOrFallback(input.firstActions, "Inspect local evidence before editing."),
    ...extraSections(input.sections ?? [])
  ].join("\n");
}

export function defaultExcludedFiles() {
  return ["node_modules", "dist", "build", ".git", ".cognopticon", "playwright-report", "test-results"];
}

export function verificationCommandsFromSignals(signals: string[], evidencePaths: string[] = []) {
  const text = [...signals, ...evidencePaths].join(" ").toLowerCase();
  const commands: string[] = [];
  if (text.includes("package.json")) commands.push("npm test");
  if (text.includes("vite") || text.includes("tsconfig") || text.includes("package.json")) commands.push("npm run build");
  if (text.includes("pyproject.toml") || text.includes("pytest")) commands.push("python -m pytest");
  if (text.includes("cargo.toml")) commands.push("cargo test");
  return unique(commands);
}

function authorityLines(authority: MissionPacketAuthority) {
  return [
    "- Read:",
    ...listOrFallback(authority.mayRead, "No read paths granted.").map((line) => `  ${line}`),
    "- Edit:",
    ...listOrFallback(authority.mayEdit, "No edit paths granted without approval.").map((line) => `  ${line}`),
    "- Run:",
    ...listOrFallback(authority.mayRun, "No commands granted without approval.").map((line) => `  ${line}`),
    "- Requires approval:",
    ...listOrFallback(authority.requiresApproval, "No approval gates recorded.").map((line) => `  ${line}`)
  ];
}

function extraSections(sections: Array<{ heading: string; body: string | string[] }>) {
  return sections.flatMap((section) => [
    "",
    `## ${section.heading}`,
    ...bodyLines(section.body)
  ]);
}

function bodyLines(body: string | string[]) {
  return Array.isArray(body) ? body : [body];
}

function listOrFallback(items: string[], fallback: string) {
  const clean = unique(items);
  return clean.length ? clean.map((item) => `- ${item}`) : [`- ${fallback}`];
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
