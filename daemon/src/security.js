import path from "node:path";

export function resolveInsideAllowedRoots(targetPath, allowedRoots) {
  const resolved = path.resolve(targetPath);
  const allowed = allowedRoots.some((root) => {
    const resolvedRoot = path.resolve(root);
    return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
  });
  if (!allowed) throw new Error("Path is outside configured Cognopticon roots.");
  return resolved;
}

export function assertAllowlistedCommand(command, allowedCommands) {
  if (!allowedCommands.includes(command)) throw new Error(`Command is not allowlisted: ${command}`);
}

export function normalizeArgs(args) {
  if (!Array.isArray(args)) return [];
  return args.map((arg) => {
    if (typeof arg !== "string") throw new Error("Command arguments must be strings");
    if (arg.includes("\0")) throw new Error("Command argument contains null byte");
    return arg;
  });
}
