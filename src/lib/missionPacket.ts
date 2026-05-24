export interface MissionPacketAuthority {
  mayRead: string[];
  mayEdit: string[];
  mayRun: string[];
  requiresApproval: string[];
}

export interface MissionPacket {
  version: 1;
  source: "project" | "proposal";
  id: string;
  projectIds: string[];
  title: string;
  objective: string;
  generatedAt: string;
  context: {
    summary: string;
    currentState: string;
    relevantFiles: string[];
    excludedFiles: string[];
    knownRisks: string[];
  };
  constraints: string[];
  acceptanceCriteria: string[];
  verificationCommands: string[];
  authority: MissionPacketAuthority;
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

export type MissionPacketValidationResult =
  | { ok: true; packet: MissionPacket }
  | { ok: false; errors: string[] };

export function renderMissionPacketMarkdown(input: MissionPacketInput) {
  const packet: MissionPacket = {
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

export function parseMissionPacketMarkdown(markdown: string): MissionPacketValidationResult {
  const jsonBlocks = [...markdown.matchAll(/^```json[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```[^\S\r\n]*$/gm)];
  if (jsonBlocks.length !== 1) {
    return {
      ok: false,
      errors: [jsonBlocks.length === 0 ? "Mission packet JSON block is missing." : "Mission packet must contain exactly one JSON block."]
    };
  }

  const packetBlocks = [...markdown.matchAll(/^## Handoff Packet[^\S\r\n]*\r?\n```json[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```[^\S\r\n]*$/gm)];
  if (packetBlocks.length !== 1) {
    return { ok: false, errors: ["Mission packet JSON block must immediately follow the Handoff Packet heading."] };
  }

  const duplicateKeys = duplicateJsonKeys(packetBlocks[0][1]);
  if (duplicateKeys.length) return { ok: false, errors: duplicateKeys.map((key) => `Mission packet JSON contains duplicate key ${key}.`) };

  try {
    return validateMissionPacket(JSON.parse(packetBlocks[0][1]));
  } catch {
    return { ok: false, errors: ["Mission packet JSON block is not valid JSON."] };
  }
}

export function assertValidMissionPacketMarkdown(markdown: string) {
  const result = parseMissionPacketMarkdown(markdown);
  if (!result.ok) throw new MissionPacketValidationError(result.errors);
  return result.packet;
}

export class MissionPacketValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Invalid mission packet: ${errors.join("; ")}`);
    this.name = "MissionPacketValidationError";
    this.errors = errors;
  }
}

export function validateMissionPacket(value: unknown): MissionPacketValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["Mission packet must be a JSON object."] };

  const topLevelKeys = ["version", "source", "id", "projectIds", "title", "objective", "generatedAt", "context", "constraints", "acceptanceCriteria", "verificationCommands", "authority"];
  rejectUnknownKeys("packet", value, topLevelKeys, errors);

  const version = value.version;
  if (version !== 1) errors.push("Mission packet version must be 1.");

  const source = value.source;
  if (source !== "project" && source !== "proposal") errors.push("Mission packet source must be project or proposal.");

  const id = requiredString(value.id, "id", errors);
  const title = requiredString(value.title, "title", errors);
  const objective = requiredString(value.objective, "objective", errors);
  const generatedAt = requiredString(value.generatedAt, "generatedAt", errors);
  if (generatedAt && !Number.isFinite(Date.parse(generatedAt))) errors.push("generatedAt must be a valid date string.");

  const projectIds = stringList(value.projectIds, "projectIds", errors, { requireItems: true });
  const constraints = stringList(value.constraints, "constraints", errors);
  const acceptanceCriteria = stringList(value.acceptanceCriteria, "acceptanceCriteria", errors, { requireItems: true });
  const verificationCommands = stringList(value.verificationCommands, "verificationCommands", errors);

  const context = contextPacket(value.context, errors);
  const authority = authorityPacket(value.authority, errors);

  const unsupportedCommands = [...verificationCommands, ...authority.mayRun].filter((command) => !isAllowedVerificationCommand(command));
  for (const command of unique(unsupportedCommands)) {
    errors.push(`Mission packet command is not allowlisted: ${command}.`);
  }
  if (authority.mayEdit.length) errors.push("Mission packet authority.mayEdit must be empty until explicit edit approval is implemented.");
  if (!authority.requiresApproval.some((item) => item.toLowerCase() === "file edits")) {
    errors.push("Mission packet authority.requiresApproval must include file edits.");
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    packet: {
      version: 1,
      source: source as MissionPacket["source"],
      id,
      projectIds,
      title,
      objective,
      generatedAt,
      context,
      constraints,
      acceptanceCriteria,
      verificationCommands,
      authority
    }
  };
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

function contextPacket(value: unknown, errors: string[]): MissionPacket["context"] {
  if (!isRecord(value)) {
    errors.push("context must be a JSON object.");
    return { summary: "", currentState: "", relevantFiles: [], excludedFiles: [], knownRisks: [] };
  }

  rejectUnknownKeys("context", value, ["summary", "currentState", "relevantFiles", "excludedFiles", "knownRisks"], errors);
  return {
    summary: requiredString(value.summary, "context.summary", errors),
    currentState: requiredString(value.currentState, "context.currentState", errors),
    relevantFiles: stringList(value.relevantFiles, "context.relevantFiles", errors, { requireItems: true }),
    excludedFiles: stringList(value.excludedFiles, "context.excludedFiles", errors, { requireItems: true }),
    knownRisks: stringList(value.knownRisks, "context.knownRisks", errors)
  };
}

function authorityPacket(value: unknown, errors: string[]): MissionPacketAuthority {
  if (!isRecord(value)) {
    errors.push("authority must be a JSON object.");
    return { mayRead: [], mayEdit: [], mayRun: [], requiresApproval: [] };
  }

  rejectUnknownKeys("authority", value, ["mayRead", "mayEdit", "mayRun", "requiresApproval"], errors);
  return {
    mayRead: stringList(value.mayRead, "authority.mayRead", errors, { requireItems: true }),
    mayEdit: stringList(value.mayEdit, "authority.mayEdit", errors),
    mayRun: stringList(value.mayRun, "authority.mayRun", errors),
    requiresApproval: stringList(value.requiresApproval, "authority.requiresApproval", errors, { requireItems: true })
  };
}

function stringList(value: unknown, label: string, errors: string[], options: { requireItems?: boolean } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array of strings.`);
    return [];
  }
  const invalidIndex = value.findIndex((item) => typeof item !== "string");
  if (invalidIndex >= 0) {
    errors.push(`${label}[${invalidIndex}] must be a string.`);
    return [];
  }
  const items = unique(value);
  if (options.requireItems && !items.length) errors.push(`${label} must include at least one item.`);
  return items;
}

function requiredString(value: unknown, label: string, errors: string[]) {
  if (typeof value !== "string") {
    errors.push(`${label} must be a string.`);
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) errors.push(`${label} must not be empty.`);
  return trimmed;
}

function rejectUnknownKeys(label: string, value: Record<string, unknown>, allowedKeys: string[], errors: string[]) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${label} has unexpected field ${key}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedVerificationCommand(command: string) {
  return [
    "npm test",
    "npm run build",
    "npm run lint",
    "npm run check",
    "npm run audit:deps",
    "npm run audit:ux",
    "npm run test:e2e",
    "npm run validate:data",
    "npm run validate:release",
    "npm run validate:community",
    "npm run validate:package",
    "npm run validate:payload",
    "npm run validate:local",
    "python -m pytest",
    "cargo test"
  ].includes(command);
}

function duplicateJsonKeys(json: string) {
  const duplicates: string[] = [];
  const stack: Array<{ kind: "object" | "array"; keys: Set<string>; expectingKey: boolean }> = [];

  for (let index = 0; index < json.length; index += 1) {
    const char = json[index];
    if (/\s/.test(char)) continue;
    if (char === "{") {
      stack.push({ kind: "object", keys: new Set(), expectingKey: true });
      continue;
    }
    if (char === "[") {
      stack.push({ kind: "array", keys: new Set(), expectingKey: false });
      continue;
    }
    if (char === "}" || char === "]") {
      stack.pop();
      continue;
    }
    if (char === ",") {
      const frame = stack.at(-1);
      if (frame?.kind === "object") frame.expectingKey = true;
      continue;
    }
    if (char !== "\"") continue;

    const token = readJsonString(json, index);
    if (!token) break;
    const frame = stack.at(-1);
    const nextChar = json[skipWhitespace(json, token.nextIndex)];
    if (frame?.kind === "object" && frame.expectingKey && nextChar === ":") {
      if (frame.keys.has(token.value)) duplicates.push(token.value);
      frame.keys.add(token.value);
      frame.expectingKey = false;
    }
    index = token.nextIndex - 1;
  }

  return unique(duplicates);
}

function readJsonString(json: string, startIndex: number) {
  for (let index = startIndex + 1; index < json.length; index += 1) {
    const char = json[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "\"") {
      const raw = json.slice(startIndex, index + 1);
      try {
        return { value: JSON.parse(raw) as string, nextIndex: index + 1 };
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function skipWhitespace(value: string, startIndex: number) {
  let index = startIndex;
  while (index < value.length && /\s/.test(value[index])) index += 1;
  return index;
}
