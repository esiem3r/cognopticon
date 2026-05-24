import { describe, expect, it } from "vitest";
import { formatManualLaunchCommand, shellJoin, shellQuote } from "./launchCommand";

describe("launch command formatting", () => {
  it("keeps simple allowlisted commands readable", () => {
    expect(formatManualLaunchCommand({
      id: "test",
      label: "Test",
      cwd: "/demo/workspace/tools/launchable-tool",
      command: "npm",
      args: ["test"],
      allowlistKey: "npm-test"
    })).toBe("cd /demo/workspace/tools/launchable-tool && npm test");
  });

  it("quotes cwd and arguments that are shell-sensitive", () => {
    expect(formatManualLaunchCommand({
      id: "grep",
      label: "Grep",
      cwd: "/tmp/Project One",
      command: "npm",
      args: ["run", "test:unit", "--", "--grep", "Bob's case"],
      allowlistKey: "npm-test"
    })).toBe("cd '/tmp/Project One' && npm run test:unit -- --grep 'Bob'\\''s case'");
  });

  it("quotes individual shell words predictably", () => {
    expect(shellQuote("plain/path-1.2")).toBe("plain/path-1.2");
    expect(shellQuote("")).toBe("''");
    expect(shellQuote("two words")).toBe("'two words'");
    expect(shellQuote("can't")).toBe("'can'\\''t'");
    expect(shellJoin(["npm", "run", "test:unit"])).toBe("npm run test:unit");
  });
});
