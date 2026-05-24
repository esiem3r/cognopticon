#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";
import { formatGate, releaseGates } from "./verification-gates.mjs";

for (const gate of releaseGates) {
  const label = formatGate(gate);
  console.log(`\n> ${label}`);
  const result = spawnSync(gate.command, gate.args, { stdio: "inherit", shell: false });
  if (result.error) {
    console.error(`Cognopticon check failed to start ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`Cognopticon check interrupted during ${label}: ${result.signal}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`Cognopticon check failed during ${label} with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}
