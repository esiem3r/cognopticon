export const releaseGates = [
  { command: "npm", args: ["run", "validate:data"] },
  { command: "npm", args: ["run", "validate:release"] },
  { command: "npm", args: ["run", "validate:community"] },
  { command: "npm", args: ["run", "validate:package"] },
  { command: "npm", args: ["run", "validate:payload"] },
  { command: "npm", args: ["run", "validate:local"] },
  { command: "npm", args: ["run", "validate:lifecycle"] },
  { command: "npm", args: ["run", "audit:deps"] },
  { command: "npm", args: ["run", "lint"] },
  { command: "npm", args: ["test"] },
  { command: "npm", args: ["run", "build"] },
  { command: "npm", args: ["run", "build:pages"] },
  { command: "npm", args: ["run", "validate:pages"] },
  { command: "npm", args: ["run", "validate:daemon"] },
  { command: "npm", args: ["run", "validate:daemon-config"] },
  { command: "npm", args: ["run", "audit:ux"] },
  { command: "npm", args: ["run", "audit:a11y"] },
  { command: "npm", args: ["run", "test:e2e"] }
];

export const releaseGateCommands = releaseGates.map(formatGate);

export function formatGate(gate) {
  return [gate.command, ...gate.args].join(" ");
}
