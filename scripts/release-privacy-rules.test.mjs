import { describe, expect, it } from "vitest";
import { releasePrivacyFindings } from "./release-privacy-rules.mjs";

describe("release privacy rules", () => {
  it("allows sanitized demo and placeholder user paths", () => {
    const text = [
      "/demo/workspace/project",
      "/home/user/example",
      "/home/example/project",
      "/Users/user/example",
      "C:\\Users\\User\\fixture"
    ].join("\n");

    expect(releasePrivacyFindings(text)).toEqual([]);
  });

  it("flags private paths and high-signal secret material", () => {
    const text = [
      ["/home/", "br34d", "/private-project"].join(""),
      ["ghp_", "a".repeat(24)].join(""),
      ["sk-", "b".repeat(24)].join(""),
      ["-----BEGIN ", "PRIVATE KEY-----"].join(""),
      ["Authorization: Bearer ", "c".repeat(24)].join(""),
      ["postgres://user:", "password", "@db.example.local/app"].join("")
    ].join("\n");

    const labels = releasePrivacyFindings(text).map((finding) => finding.label);

    expect(labels).toContain("private Linux home path");
    expect(labels).toContain("GitHub-style access token");
    expect(labels).toContain("OpenAI-style API token");
    expect(labels).toContain("private key block");
    expect(labels).toContain("HTTP bearer authorization header");
    expect(labels).toContain("database URL with credentials");
  });
});
