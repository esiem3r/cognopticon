import { expect, test } from "@playwright/test";

test("renders the project universe and opens a mission brief", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Cosmopticon controls").getByRole("heading", { name: "Cosmopticon" })).toBeVisible();
  await expect(page.getByTestId("universe-canvas")).toBeVisible();
  await expect(page.getByLabel("Cosmopticon dossier").getByRole("heading", { name: "Cosmopticon" })).toBeVisible();

  const pixels = await page.getByTestId("universe-canvas").evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d");
    const data = context?.getImageData(0, 0, Math.min(canvas.width, 80), Math.min(canvas.height, 80)).data;
    if (!data) return 0;
    let nonBlank = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] || data[index + 1] || data[index + 2]) nonBlank += 1;
    }
    return nonBlank;
  });
  expect(pixels).toBeGreaterThan(100);

  await page.getByRole("button", { name: "Mission brief", exact: true }).click();
  await expect(page.getByLabel("Generated mission brief")).toContainText("# Mission Brief: Cosmopticon");
  await expect(page.getByRole("link", { name: "Download Brief" })).toHaveAttribute("download", /cosmopticon-.*-mission\.md/);
});

test("search focuses a local project dossier", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search projects").fill("Threadgraph");
  await expect(page.getByRole("heading", { name: "Threadgraph" })).toBeVisible();
  await expect(page.getByText("graph-native corpus engine")).toBeVisible();
});

test("focus modes and next action queue expose durable workflow", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Focus mode").selectOption("research");
  await expect(page.getByLabel("Next action queue")).toContainText("Kern Dogs");
  await page.getByRole("button", { name: /Kern Dogs/ }).first().click();
  await expect(page.getByLabel("Kern Dogs dossier")).toContainText("Decision");
});
