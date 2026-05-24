import { expect, test, type Page } from "@playwright/test";

test("renders the project universe and opens a mission brief", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Cognopticon controls").getByRole("heading", { name: "Cognopticon" })).toBeVisible();
  await expect(page.getByTestId("universe-canvas")).toBeVisible();
  await expect(page.getByLabel(/node cockpit/i)).toBeVisible();
  await expect(page.getByLabel("Cognition rail")).toBeVisible();
  await expect(page.getByLabel("Graph state encoding")).toContainText(/Ready|Anomaly|Launch|Links/);

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

  await page.getByRole("button", { name: "Generate Mission", exact: true }).first().click();
  await expect(page.getByLabel("Generated mission brief")).toContainText("# Mission Brief:");
  await expect(page.getByLabel("Generated mission brief")).toContainText("## Handoff Packet");
  await expect(page.getByLabel("Mission approval state")).toContainText(/awaiting_approval|Approve/);
  await expect(page.getByRole("link", { name: "Download Brief" })).toHaveAttribute("download", /.*-mission\.md/);
  await expect(page.getByRole("link", { name: "Download Brief" })).toHaveAttribute("href", /^blob:/);
});

test("search focuses a local project dossier", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Search projects").fill("launchable");
  await expect(page.locator(".node-cockpit").getByRole("heading", { name: "Launchable Tool" })).toBeVisible();
  await expect(page.locator(".node-cockpit")).toContainText(/LaunchPort|launch/i);
});

test("focus modes and next action queue expose durable workflow", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Focus mode").selectOption("all");
  await page.getByRole("button", { name: "Toggle next action queue" }).click();
  const firstTask = page.locator(".task-card").first();
  await expect(firstTask).toBeVisible();
  await firstTask.locator("summary").click();
  await firstTask.getByLabel("Run a concrete verification and capture the result").check();
  await expect(firstTask.locator(".progress-ring")).toContainText("25");
  await expect(page.locator(".node-cockpit")).toContainText(/readiness|Beliefs/i);
});

test("graph-native cockpit and cognition rail generate proposal missions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Cognition rail")).toContainText("Proposals");
  await expect(page.getByLabel("Cognition rail")).toContainText("Missions");
  await page.locator(".proposal-card").first().getByRole("button", { name: "Mission" }).click();
  await expect(page.getByLabel("Generated mission brief")).toContainText("# Mission:");
  await expect(page.getByLabel("Generated mission brief")).toContainText('"source": "proposal"');
});

test("daemon offline state exposes useful fallback actions", async ({ page }) => {
  await page.goto("/?daemon=off");
  await expect(page.getByLabel("Cognition rail")).toContainText("Daemon offline");
  await expect(page.getByLabel("Cognition rail")).toContainText("copy-command fallbacks");
  await expect(page.locator(".launch-port").first()).toContainText(/fallback|offline|daemon/i);
});

test("orchestrator access arms the visualizer without exposing workers", async ({ page }) => {
  await page.goto("/?daemon=off");
  await page.getByRole("button", { name: "Start Orchestrator" }).click();
  await expect(page.getByLabel("Orchestrator access")).toContainText(/Visualizer armed|User access only/);
  await expect(page.getByLabel("Orchestrator access")).toContainText(/orchestrator/i);
  await expect(page.getByRole("complementary", { name: "Next action queue" })).toBeVisible();
  await expect(page.getByTestId("universe-canvas")).toBeVisible();
});

test("mission approval stages work without daemon dispatch", async ({ page }) => {
  await page.goto("/?daemon=off");
  await page.getByRole("button", { name: "Generate Mission", exact: true }).first().click();
  await page.getByRole("button", { name: "Mark Reviewed" }).click();
  await expect(page.getByLabel("Mission approval state")).toContainText(/reviewed|No command was dispatched/i);
  await expect(page.getByLabel("Runtime event feed")).not.toContainText(/Dispatching|Daemon job/i);
});

test("malformed mission packet blocks official drawer delivery controls", async ({ page }) => {
  await page.goto("/tests/fixtures/mission-drawer-harness.html?mode=invalid");
  await expect(page.getByLabel("Generated mission brief")).toContainText("No structured packet.");
  await expect(page.getByLabel("Mission approval state")).toContainText("blocked");
  await expect(page.getByLabel("Mission approval state")).toContainText("Mission packet JSON block is missing");

  const download = page.locator(".download-button", { hasText: "Download Brief" });
  await expect(download).toHaveAttribute("aria-disabled", "true");
  await expect(download).toHaveAttribute("tabindex", "-1");
  expect(await download.getAttribute("href")).toBeNull();

  await expect(page.getByRole("button", { name: "Copy Brief" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Copy Worker Prompt" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Mark Reviewed" })).toBeDisabled();
});

test("mission drawer copies a bounded worker prompt without dispatching", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          window.localStorage.setItem("cognopticon:test:clipboard", text);
          return Promise.resolve();
        }
      }
    });
  });

  await page.goto("/tests/fixtures/mission-drawer-harness.html");
  await expect(page.getByLabel("Mission approval state")).toContainText("Manual handoff ready");
  await page.getByRole("button", { name: "Copy Worker Prompt" }).click();
  await expect(page.locator(".mission-copy-feedback")).toContainText("Worker prompt copied.");
  await page.getByRole("button", { name: "Mark Reviewed" }).click();
  await expect(page.getByLabel("Mission approval state")).toContainText("Mission reviewed.");
  const copied = await page.evaluate(() => window.localStorage.getItem("cognopticon:test:clipboard") ?? "");

  expect(copied).toContain("You are the worker Codex instance for Mission Brief: Drawer Harness.");
  expect(copied).toContain("No edit authority granted by this packet.");
  expect(copied).toContain("Do not start new daemon, agent, git, network, or destructive operations");
  expect(copied).toContain("Validated handoff packet:");
  expect(copied).not.toContain("daemonToken");
  await expect(page.getByLabel("Runtime event feed")).toHaveCount(0);
});

test("runtime rail explains daemon failures with action provenance", async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    const mockedFetch: typeof window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("http://127.0.0.1:8787/api/health")) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, daemon: "cognopticon" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }));
      }
      if (url.startsWith("http://127.0.0.1:8787/api/events")) {
        const lines = [
          JSON.stringify({
            id: "daemon:boundary",
            type: "action_failed",
            payload: { error: "Origin is not allowed: http://127.0.0.1:5176" },
            createdAt: "2026-05-23T12:00:00.000Z"
          }),
          JSON.stringify({
            id: "daemon:policy",
            type: "action_failed",
            payload: {
              error: "Destructive commands are not supported",
              category: "policy_block",
              action: "daemon_job",
              endpoint: "/api/jobs",
              method: "POST",
              requestId: "request:42"
            },
            createdAt: "2026-05-23T12:00:01.000Z"
          }),
          JSON.stringify({
            id: "daemon:path",
            type: "action_failed",
            payload: {
              error: "Path is outside configured Cognopticon roots: /home/user/private/project",
              category: "policy_block",
              action: "daemon_job",
              endpoint: "/api/jobs",
              method: "POST",
              requestId: "request:path"
            },
            createdAt: "2026-05-23T12:00:02.000Z"
          })
        ];
        return Promise.resolve(new Response(`event: snapshot\ndata: ${JSON.stringify(lines)}\n\n`, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" }
        }));
      }
      return originalFetch(input, init);
    };
    window.fetch = mockedFetch;
  });

  await page.goto("/");
  const feed = page.getByLabel("Runtime event feed");
  await expect(feed).toContainText("Policy blocked");
  await expect(feed).toContainText("Destructive commands are not supported");
  await expect(feed).toContainText("POST /api/jobs / request:42");
  await expect(feed).toContainText("Path is outside configured Cognopticon roots.");
  await expect(feed).not.toContainText("/home/user/private/project");
  await expect(feed).not.toContainText("Origin is not allowed");
  await expect(feed).not.toContainText("action failed");
});

test("run lane ignores unscoped browser history", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("cognopticon:runs", JSON.stringify([{
      id: "private-run",
      projectId: "private-project",
      title: "PRIVATE LOCAL COMMAND",
      status: "failed",
      summary: "private stderr should not cross into the demo workspace",
      command: "cat /private/file",
      createdAt: "2026-05-23T00:00:00.000Z",
      updatedAt: "2026-05-23T00:00:00.000Z"
    }]));
  });
  await page.goto("/");
  await expect(page.getByLabel("Runtime event feed")).not.toContainText("PRIVATE LOCAL COMMAND");
  await expect(page.getByLabel("Runtime event feed")).not.toContainText("/private/file");
  const legacyValue = await page.evaluate(() => window.localStorage.getItem("cognopticon:runs"));
  expect(legacyValue).toBeNull();
});

test("run lane ignores legacy title-derived workspace history", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("cognopticon:runs:sample:cognopticon-demo-workspace", JSON.stringify([{
      id: "colliding-title-run",
      projectId: "private-project",
      title: "MATCHING TITLE PRIVATE RUN",
      status: "failed",
      summary: "same title/source but different roots must not render",
      createdAt: "2026-05-23T00:00:00.000Z",
      updatedAt: "2026-05-23T00:00:00.000Z"
    }]));
  });
  await page.goto("/");
  await expect(page.getByLabel("Runtime event feed")).not.toContainText("MATCHING TITLE PRIVATE RUN");
  const legacyValue = await page.evaluate(() => window.localStorage.getItem("cognopticon:runs:sample:cognopticon-demo-workspace"));
  expect(legacyValue).toBeNull();
});

test("visibility menu filters by type and project", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /visible/ }).click();
  await expect(page.getByLabel("Project visibility filters")).toBeVisible();
  await page.getByLabel("Tools").check();
  await expect(page.getByLabel("Project visibility filters").getByLabel("Tools")).toBeChecked();
  await page.getByLabel("Project visibility filters").getByText("Project", { exact: true }).click();
  await page.locator(".project-checkbox-list label").first().click();
  await expect(page.getByLabel("Project visibility filters").locator(".project-checkbox-list input").first()).toBeChecked();
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

const productViewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 }
];

test("responsive shell keeps controls reachable across product viewports", async ({ page }) => {
  for (const viewport of productViewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("universe-canvas")).toBeVisible();

    const audit = await page.evaluate(() => {
      const selectors = "button, input:not([type='hidden']), select, textarea, a[href], summary";
      const controls = Array.from(document.querySelectorAll<HTMLElement>(selectors))
        .filter((element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden"
            && style.display !== "none"
            && rect.width > 0
            && rect.height > 0;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: element.getAttribute("aria-label") || element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || element.tagName,
            tag: element.tagName,
            width: rect.width,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom
          };
        });
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        clipped: controls.filter((control) => control.left < -1 || control.right > window.innerWidth + 1),
        undersized: controls.filter((control) => control.width < 43.5 || control.height < 43.5)
      };
    });

    expect(audit.scrollWidth, `${viewport.width}x${viewport.height} should not create document horizontal overflow`).toBe(audit.innerWidth);
    expect(audit.clipped, `${viewport.width}x${viewport.height} clipped controls`).toEqual([]);
    expect(audit.undersized, `${viewport.width}x${viewport.height} undersized controls`).toEqual([]);
  }
});

test("mobile first viewport exposes graph context and an action path", async ({ page }) => {
  for (const viewport of productViewports.slice(0, 4)) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("universe-canvas")).toBeVisible();
    await expect(page.getByLabel("Mobile workflow actions")).toBeVisible();
    await expect(page.getByLabel("Mobile workflow actions")).toContainText(/Top proposal|Selected/);
    await expect(page.getByLabel("Mobile workflow actions").getByRole("button", { name: "Mission" })).toBeVisible();
    const dockBox = await page.getByLabel("Mobile workflow actions").boundingBox();
    expect(dockBox, `${viewport.width}x${viewport.height} mobile action dock missing`).not.toBeNull();
    if (dockBox) expect(dockBox.y + dockBox.height, `${viewport.width}x${viewport.height} action dock should be in first viewport`).toBeLessThanOrEqual(viewport.height);
  }
});

test("mobile graph labels avoid overlay controls", async ({ page }) => {
  for (const viewport of productViewports.slice(0, 3)) {
    await page.setViewportSize(viewport);
    await page.goto(`/?labelAudit=${viewport.width}`);
    await page.getByLabel("Search projects").fill("launchable");
    await page.waitForTimeout(1000);

    await expect.poll(async () => (await graphLabelOverlayAudit(page)).visibleLabels, {
      message: `${viewport.width}x${viewport.height} should expose visible graph labels before overlay audit`
    }).toBeGreaterThan(0);
    const closed = await graphLabelOverlayAudit(page);
    await expect(page.locator(".project-label-layer")).toHaveAttribute("data-suppressed", "false");
    expect(closed.visibleLabels, `${viewport.width}x${viewport.height} closed visible label count`).toBeGreaterThan(0);
    expect(closed.overlaps, `${viewport.width}x${viewport.height} closed overlay collisions`).toEqual([]);
    expect(closed.labelOverlaps, `${viewport.width}x${viewport.height} closed label collisions`).toEqual([]);

    await page.getByRole("button", { name: /visible/ }).click();
    await expect(page.getByLabel("Project visibility filters")).toBeVisible();
    await expect(page.locator(".project-label-layer")).toHaveAttribute("data-suppressed", "true");
    const filterOpen = await graphLabelOverlayAudit(page);
    expect(filterOpen.overlaps, `${viewport.width}x${viewport.height} filter-popover collisions`).toEqual([]);
    expect(filterOpen.visibleLabels, `${viewport.width}x${viewport.height} filter popover should suppress graph labels`).toBe(0);

    await page.getByRole("button", { name: "Close visibility filters" }).click();
    await page.getByRole("button", { name: "Toggle next action queue" }).click();
    await expect(page.getByRole("complementary", { name: "Next action queue" })).toBeVisible();
    await expect(page.locator(".project-label-layer")).toHaveAttribute("data-suppressed", "true");
    const queueOpen = await graphLabelOverlayAudit(page);
    expect(queueOpen.overlaps, `${viewport.width}x${viewport.height} queue-popover collisions`).toEqual([]);
    expect(queueOpen.visibleLabels, `${viewport.width}x${viewport.height} queue popover should suppress graph labels`).toBe(0);
  }
});

test("tablet landscape and desktop keep proposal work visible beside the graph", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  const proposal = page.locator(".proposal-card").first();
  await expect(proposal).toBeVisible();
  const box = await proposal.boundingBox();
  expect(box).not.toBeNull();
  if (box) expect(box.y).toBeLessThan(768);
});

test("graph controls recenter the existing canvas without recreating it", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(800);
  const canvas = page.getByTestId("universe-canvas");
  await canvas.evaluate((node: HTMLCanvasElement) => {
    node.dataset.graphControlProbe = "original";
  });
  const before = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL("image/png").length);
  await page.getByRole("button", { name: "Fit" }).click();
  await page.getByRole("button", { name: "Center" }).click();
  await page.waitForTimeout(400);
  await expect(page.getByTestId("universe-canvas")).toHaveAttribute("data-graph-control-probe", "original");
  const after = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL("image/png").length);
  expect(after).toBeGreaterThan(5000);
  expect(Math.abs(after - before)).toBeLessThan(25000);
});

test("keyboard traverses the graph without pointer input", async ({ page }) => {
  await page.goto("/");
  const canvas = page.getByTestId("universe-canvas");
  const status = page.getByRole("status", { name: "Graph keyboard status", includeHidden: true });

  await expect(canvas).toHaveAttribute("tabindex", "0");
  await canvas.focus();
  await expect(canvas).toBeFocused();
  await expect(status).toContainText("9 visible projects available");
  const focusStyle = await canvas.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow
    };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(focusStyle.boxShadow).not.toBe("none");

  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".node-cockpit").getByRole("heading", { name: "Launchable Tool" })).toBeVisible();
  await expect(status).toContainText("Selected Launchable Tool. 1 of 9 visible projects.");

  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".node-cockpit").getByRole("heading", { name: "Proof Forge" })).toBeVisible();
  await expect(status).toContainText("Selected Proof Forge. 2 of 9 visible projects.");

  await page.keyboard.press("End");
  await expect(page.locator(".node-cockpit").getByRole("heading", { name: "Public Release Blocker" })).toBeVisible();
  await expect(status).toContainText("Selected Public Release Blocker. 9 of 9 visible projects.");

  await page.keyboard.press("Home");
  await expect(page.locator(".node-cockpit").getByRole("heading", { name: "Launchable Tool" })).toBeVisible();
  await expect(status).toContainText("Selected Launchable Tool. 1 of 9 visible projects.");

  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".node-cockpit").getByRole("heading", { name: "Public Release Blocker" })).toBeVisible();
  await expect(status).toContainText("Selected Public Release Blocker. 9 of 9 visible projects.");

  await page.keyboard.press("ArrowUp");
  await expect(page.locator(".node-cockpit").getByRole("heading", { name: "Archive Fossil" })).toBeVisible();
  await expect(status).toContainText("Selected Archive Fossil. 8 of 9 visible projects.");

  await page.getByLabel("Search projects").fill("operator");
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".node-cockpit").getByRole("heading", { name: "Operator Studio v2" })).toBeVisible();
  await expect(status).toContainText("Selected Operator Studio v2. 2 of 2 visible projects.");

  await page.getByLabel("Search projects").fill("no matching project");
  await canvas.focus();
  await expect(status).toContainText("Selected Operator Studio v2. 0 visible projects available.");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".node-cockpit").getByRole("heading", { name: "Operator Studio v2" })).toBeVisible();
  await expect(status).toContainText("Selected Operator Studio v2. 0 visible projects available.");
});

test("reduced motion freezes ambient graph drift while preserving graph navigation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const canvas = page.getByTestId("universe-canvas");
  const status = page.getByRole("status", { name: "Graph keyboard status", includeHidden: true });

  await expect(canvas).toHaveAttribute("data-reduced-motion", "true");
  await page.waitForTimeout(800);
  const before = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL("image/png"));
  await page.waitForTimeout(900);
  const after = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL("image/png"));
  expect(after).toBe(before);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.52);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.38, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const afterDrag = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL("image/png"));
  expect(afterDrag).not.toBe(before);

  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -260);
  await page.keyboard.up("Control");
  await page.waitForTimeout(250);
  const afterWheel = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL("image/png"));
  expect(afterWheel).not.toBe(afterDrag);

  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".node-cockpit").getByRole("heading", { name: "Launchable Tool" })).toBeVisible();
  await expect(status).toContainText("Selected Launchable Tool. 1 of 9 visible projects.");
});

test("reduced motion accepts legacy matchMedia listeners", async ({ page }) => {
  await page.addInitScript(() => {
    window.matchMedia = (query: string) =>
      ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true
      }) as unknown as MediaQueryList;
  });
  await page.goto("/");

  const canvas = page.getByTestId("universe-canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-reduced-motion", "true");
});

async function graphLabelOverlayAudit(page: Page) {
  return await page.evaluate(() => {
    const rectOf = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        label: element.getAttribute("aria-label") || element.textContent?.trim().replace(/\s+/g, " ") || element.tagName,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom
      };
    };
    const controlSelectors = [
      ".filter-trigger",
      ".graph-controls",
      ".queue-overlay",
      ".mobile-action-dock",
      ".filter-popover",
      ".queue-popover",
      ".graph-instrument"
    ];
    const controls = controlSelectors
      .map((selector) => document.querySelector(selector))
      .filter(Boolean)
      .map((element) => rectOf(element as Element));
    const labels = Array.from(document.querySelectorAll(".project-label"))
      .filter((element) => Number(window.getComputedStyle(element).opacity) > 0.5)
      .map(rectOf);

    const overlaps = labels.flatMap((label) => controls.map((control) => {
      const overlapWidth = Math.max(0, Math.min(label.right, control.right) - Math.max(label.left, control.left));
      const overlapHeight = Math.max(0, Math.min(label.bottom, control.bottom) - Math.max(label.top, control.top));
      return { label: label.label, control: control.label, area: Math.round(overlapWidth * overlapHeight) };
    })).filter((item) => item.area > 1);
    const labelOverlaps = labels.flatMap((label, index) => labels.slice(index + 1).map((other) => {
      const overlapWidth = Math.max(0, Math.min(label.right, other.right) - Math.max(label.left, other.left));
      const overlapHeight = Math.max(0, Math.min(label.bottom, other.bottom) - Math.max(label.top, other.top));
      return { label: label.label, other: other.label, area: Math.round(overlapWidth * overlapHeight) };
    })).filter((item) => item.area > 1);

    return { visibleLabels: labels.length, overlaps, labelOverlaps };
  });
}
