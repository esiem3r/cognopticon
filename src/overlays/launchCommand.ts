import type { LaunchCommand } from "../model/cognopticonNode";

export function formatManualLaunchCommand(command: LaunchCommand) {
  return `cd ${shellQuote(command.cwd)} && ${shellJoin([command.command, ...command.args])}`;
}

export function shellJoin(parts: string[]) {
  return parts.map(shellQuote).join(" ");
}

export function shellQuote(value: string) {
  if (/^[A-Za-z0-9_/:=.,+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}
