import type { Capability, DaemonStatus } from "./types";

export function buildCapabilityRegistry(daemonStatus?: DaemonStatus): Capability[] {
  const daemonOnline = Boolean(daemonStatus?.online);
  return [
    { id: "focus_graph", label: "Focus Graph", kind: "focus_graph", available: true, requiresDaemon: false, requiresApproval: false, description: "Move the graph camera to the relevant node or cluster." },
    { id: "copy_to_clipboard", label: "Copy", kind: "copy_to_clipboard", available: true, requiresDaemon: false, requiresApproval: false, description: "Copy a path, command, or mission packet." },
    { id: "generate_mission", label: "Generate Mission", kind: "generate_mission", available: true, requiresDaemon: false, requiresApproval: false, description: "Compile a bounded mission." },
    { id: "open_path", label: "Open Path", kind: "open_path", available: daemonOnline, requiresDaemon: true, requiresApproval: true, description: "Open an allowlisted local path via daemon." },
    { id: "open_editor", label: "Open Editor", kind: "open_editor", available: daemonOnline, requiresDaemon: true, requiresApproval: true, description: "Open editor for an allowlisted local path." },
    { id: "run_readonly_command", label: "Run Readonly Command", kind: "run_readonly_command", available: daemonOnline, requiresDaemon: true, requiresApproval: true, description: "Run an allowlisted readonly command through daemon." },
    { id: "delegate_to_agent", label: "Copy Agent Packet", kind: "delegate_to_agent", available: true, requiresDaemon: false, requiresApproval: true, description: "Manual-copy agent adapter; no automatic dispatch." }
  ];
}
