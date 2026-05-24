export function isReleasePayloadPath(path) {
  if (!path) return false;
  if (path.startsWith(".cognopticon/") || path.startsWith("dist/") || path.startsWith("dist-pages/") || path.startsWith("node_modules/")) return false;
  if (path.startsWith("test-results/") || path.startsWith("playwright-report/") || path.startsWith("_cognopticon_safety/")) return false;
  return path === ".gitignore"
    || path === ".npmignore"
    || path === "CODE_OF_CONDUCT.md"
    || path === "CONTRIBUTING.md"
    || path === "LICENSE"
    || path === "README.md"
    || path === "SECURITY.md"
    || path === "SUPPORT.md"
    || path === "eslint.config.js"
    || path === "index.html"
    || path === "package.json"
    || path === "package-lock.json"
    || path === "playwright.config.ts"
    || path === "tsconfig.app.json"
    || path === "tsconfig.json"
    || path === "tsconfig.node.json"
    || path === "vite.config.ts"
    || path.startsWith(".github/")
    || path.startsWith("daemon/")
    || path.startsWith("docs/")
    || path.startsWith("scripts/")
    || path.startsWith("src/")
    || path.startsWith("tests/");
}
