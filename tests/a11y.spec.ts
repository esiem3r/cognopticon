import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

const appStates: Array<{ name: string; setup: (page: Page) => Promise<void> }> = [
  { name: "default graph cockpit", setup: async (page) => {
    await page.goto("/");
    await page.getByTestId("universe-canvas").waitFor({ state: "visible" });
  } },
  { name: "visibility filters", setup: async (page) => {
    await page.goto("/");
    await page.getByRole("button", { name: /visible/ }).click();
    await page.getByLabel("Project visibility filters").waitFor({ state: "visible" });
  } },
  { name: "next action queue", setup: async (page) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle next action queue" }).click();
    await page.getByRole("complementary", { name: "Next action queue" }).waitFor({ state: "visible" });
  } },
  { name: "generated mission drawer", setup: async (page) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Generate Mission", exact: true }).first().click();
    await page.getByLabel("Generated mission brief").waitFor({ state: "visible" });
  } },
  { name: "valid mission drawer harness", setup: async (page) => {
    await page.goto("/tests/fixtures/mission-drawer-harness.html");
    await page.getByLabel("Generated mission brief").waitFor({ state: "visible" });
  } },
  { name: "invalid mission drawer harness", setup: async (page) => {
    await page.goto("/tests/fixtures/mission-drawer-harness.html?mode=invalid");
    await page.getByLabel("Mission approval state").waitFor({ state: "visible" });
  } }
];

test.describe("semantic accessibility audit @a11y", () => {
  for (const state of appStates) {
    test(`${state.name} has no automated WCAG A/AA violations`, async ({ page }) => {
      await state.setup(page);

      const results = await new AxeBuilder({ page })
        .withTags(wcagTags)
        .analyze();

      expect(formatViolations(results.violations)).toEqual([]);
    });
  }
});

function formatViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.slice(0, 5).map((node) => ({
      target: node.target.join(" "),
      summary: node.failureSummary
    }))
  }));
}
