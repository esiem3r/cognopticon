import type { NodeAction } from "./cognopticonNode";

export function isDestructiveAction(action: NodeAction) {
  const text = `${action.label} ${JSON.stringify(action.spec)}`.toLowerCase();
  return /delete|remove|rm -rf|git push|git commit|reset --hard|format disk/.test(text);
}

export function actionCapabilityId(action: NodeAction) {
  if (action.kind === "generate_mission") return "generate_mission";
  if (action.kind === "open_path") return "open_path";
  if (action.kind === "open_editor") return "open_editor";
  if (action.kind === "run_command") return "run_readonly_command";
  if (action.kind === "focus_graph") return "focus_graph";
  return "copy_to_clipboard";
}
