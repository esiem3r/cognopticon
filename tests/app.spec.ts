import { expect, test } from "@playwright/test";

test("renders the project universe and opens a mission brief", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Cosmopticon controls").getByRole("heading", { name: "Cosmopticon" })).toBeVisible();
  await expect(page.getByTestId("universe-canvas")).toBeVisible();
  await expect(page.getByLabel("Cosmopticon dossier").getByRole("heading", { name: "Cosmopticon" })).toBeVisible();

  await page.waitForTimeout(250);
  const webglProof = await page.getByTestId("universe-canvas").evaluate((canvas: HTMLCanvasElement) => {
    const dataUrl = canvas.toDataURL("image/png");
    return {
      width: canvas.width,
      height: canvas.height,
      dataLength: dataUrl.length
    };
  });
  expect(webglProof.width).toBeGreaterThan(300);
  expect(webglProof.height).toBeGreaterThan(300);
  expect(webglProof.dataLength).toBeGreaterThan(5000);

  await page.getByRole("button", { name: "Generate Mission Brief", exact: true }).click();
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
  await page.getByRole("button", { name: "Toggle next action queue" }).click();
  await expect(page.getByRole("complementary", { name: "Next action queue" })).toContainText("Kern Dogs");
  const kernDogsTask = page.locator(".task-card").filter({ hasText: "Kern Dogs" });
  await kernDogsTask.locator("summary").click();
  await kernDogsTask.getByLabel("Run a concrete verification and capture the result").check();
  await expect(kernDogsTask.locator(".progress-ring")).toContainText("25");
  await expect(page.getByLabel("Kern Dogs dossier")).toContainText("Decision");
});

test("visibility menu filters by type and project", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /visible/ }).click();
  await expect(page.getByLabel("Project visibility filters")).toBeVisible();
  await page.getByLabel("Math").check();
  await expect(page.getByRole("button", { name: /4 visible/ })).toBeVisible();
  await page.getByLabel("Project visibility filters").getByText("Project", { exact: true }).click();
  await page.getByLabel("Kern Dogs").check();
  await expect(page.getByRole("button", { name: /1 visible/ })).toBeVisible();
});

test("canvas supports direct drag and wheel navigation", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(800);
  const canvas = page.getByTestId("universe-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const snapshotSize = async () => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL("image/png").length);
  const before = await snapshotSize();
  await page.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.52);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.38, { steps: 12 });
  await page.mouse.up();
  await page.mouse.wheel(26, 22);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -260);
  await page.keyboard.up("Control");
  await page.waitForTimeout(500);
  const after = await snapshotSize();
  expect(Math.abs(after - before)).toBeGreaterThan(1000);
});

test("trackpad horizontal wheel orbits without replacing canvas", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(800);
  const canvas = page.getByTestId("universe-canvas");
  await canvas.evaluate((node: HTMLCanvasElement) => {
    node.dataset.trackpadProbe = "original";
  });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const snapshotSize = async () => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL("image/png").length);
  const before = await snapshotSize();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  for (let step = 0; step < 5; step += 1) {
    await page.mouse.wheel(180, 0);
  }
  await page.waitForTimeout(650);
  const after = await snapshotSize();

  await expect(page.getByTestId("universe-canvas")).toHaveAttribute("data-trackpad-probe", "original");
  expect(Math.abs(after - before)).toBeGreaterThan(900);
});

test("dragging does not recreate the WebGL canvas", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(800);
  const canvas = page.getByTestId("universe-canvas");
  await canvas.evaluate((node: HTMLCanvasElement) => {
    node.dataset.stabilityProbe = "original";
  });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let step = 0; step < 12; step += 1) {
    await page.mouse.move(box.x + box.width * (0.42 + step * 0.014), box.y + box.height * (0.5 + Math.sin(step / 2) * 0.1));
  }
  await page.mouse.up();
  await expect(page.getByTestId("universe-canvas")).toHaveAttribute("data-stability-probe", "original");
});

test("maximum zoom still leaves the universe visible", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(800);
  const canvas = page.getByTestId("universe-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.keyboard.down("Control");
  for (let step = 0; step < 8; step += 1) {
    await page.mouse.wheel(0, -800);
  }
  await page.keyboard.up("Control");
  await page.waitForTimeout(900);

  const dataLength = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL("image/png").length);
  expect(dataLength).toBeGreaterThan(15000);
});
