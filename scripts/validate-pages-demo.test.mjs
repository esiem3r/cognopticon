import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const validator = fileURLToPath(new URL("./validate-pages-demo.mjs", import.meta.url));
let directory;
let assets;

function validate() {
  const result = spawnSync(process.execPath, [validator], { cwd: directory, encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("Pages artifact validation", () => {
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "cognopticon-pages-"));
    assets = join(directory, "dist-pages", "assets");
    mkdirSync(assets, { recursive: true });
    writeFileSync(join(directory, "dist-pages", "index.html"), [
      "<title>Cognopticon</title>",
      '<script type="module" src="/cognopticon/assets/app.js"></script>',
      '<link rel="stylesheet" href="/cognopticon/assets/style.css">',
      '<link rel="modulepreload" href="/cognopticon/assets/helper.js">'
    ].join("\n"));
    writeFileSync(join(assets, "app.js"), `console.log("${"demo ".repeat(30)}");`);
    writeFileSync(join(assets, "style.css"), `body { color: white; } /* ${"demo ".repeat(30)} */`);
    // Bundlers can emit valid runtime helpers much smaller than 100 bytes.
    writeFileSync(join(assets, "helper.js"), "export const identity = value => value;\n");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("accepts a nonempty helper chunk smaller than 100 bytes", () => {
    expect(validate().status).toBe(0);
  });

  it("rejects empty asset files", () => {
    writeFileSync(join(assets, "helper.js"), "");
    const result = validate();
    expect(result.status).toBe(1);
    expect(result.output).toContain("Pages asset must be a non-empty file");
  });

  it("rejects missing referenced assets", () => {
    rmSync(join(assets, "helper.js"));
    const result = validate();
    expect(result.status).toBe(1);
    expect(result.output).toContain("Pages asset reference is missing");
  });

  it("rejects a directory referenced as an asset", () => {
    rmSync(join(assets, "helper.js"));
    mkdirSync(join(assets, "helper.js"));
    const result = validate();
    expect(result.status).toBe(1);
    expect(result.output).toContain("Pages asset must be a non-empty file");
  });

  it("rejects assets outside the deployed project base", () => {
    const index = join(directory, "dist-pages", "index.html");
    writeFileSync(index, readFileSync(index, "utf8").replaceAll("/cognopticon/assets/", "/wrong/assets/"));
    const result = validate();
    expect(result.status).toBe(1);
    expect(result.output).toContain("Pages asset reference must use project base");
  });

  it("still rejects local daemon APIs in small chunks", () => {
    writeFileSync(join(assets, "helper.js"), 'fetch("/api/workspace");');
    const result = validate();
    expect(result.status).toBe(1);
    expect(result.output).toContain("local-runtime API surface forbidden");
  });
});
