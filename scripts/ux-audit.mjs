#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { releasePrivateContentPatterns } from "./release-privacy-rules.mjs";

const root = process.cwd();
const artifactDir = resolve(root, "test-results", "ux-audit");
const port = Number(process.env.COGNOPTICON_UX_AUDIT_PORT ?? 5181);
const baseUrl = `http://127.0.0.1:${port}`;
const viewports = [
  { id: "mobile-360", width: 360, height: 800 },
  { id: "mobile-390", width: 390, height: 844 },
  { id: "mobile-412", width: 412, height: 915 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "desktop-1024", width: 1024, height: 768 },
  { id: "desktop-1440", width: 1440, height: 1000 },
  { id: "desktop-1920", width: 1920, height: 1080 }
];
const states = [
  { id: "default", setup: async () => {} },
  { id: "filters", setup: async (page) => {
    await page.getByRole("button", { name: /visible/ }).click();
    const filters = page.getByLabel("Project visibility filters");
    await filters.waitFor({ state: "visible" });
    await filters.locator("details").evaluateAll((details) => {
      for (const item of details) item.open = true;
    });
  } },
  { id: "queue", setup: async (page) => {
    await page.getByRole("button", { name: "Toggle next action queue" }).click();
    await page.getByRole("complementary", { name: "Next action queue" }).waitFor({ state: "visible" });
  } },
  { id: "mission", setup: async (page) => {
    await clickFirstActionable(page.getByRole("button", { name: "Generate Mission", exact: true }));
    await page.getByLabel("Generated mission brief").waitFor({ state: "visible" });
  } },
  { id: "runtime-health", setup: async (page) => {
    await page.getByRole("button", { name: "Open runtime health" }).click();
    await page.getByRole("dialog", { name: "Local runtime health" }).waitFor({ state: "visible" });
  } },
  { id: "run-history", setup: async (page) => {
    await page.getByRole("button", { name: "Open run history" }).click();
    await page.getByRole("dialog", { name: "Run history" }).waitFor({ state: "visible" });
  } }
];
const browserPrivacyPatternSpecs = releasePrivateContentPatterns.map(({ label, pattern }) => ({
  label,
  source: pattern.source,
  flags: pattern.flags
}));

rmSync(artifactDir, { recursive: true, force: true });
mkdirSync(artifactDir, { recursive: true });

const server = spawn(process.execPath, [resolve(root, "node_modules", "vite", "bin", "vite.js"), "--mode", "pages", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  env: { ...process.env, FORCE_COLOR: "0" },
  stdio: ["ignore", "pipe", "pipe"]
});
const serverLog = [];
server.stdout.on("data", (chunk) => serverLog.push(chunk.toString()));
server.stderr.on("data", (chunk) => serverLog.push(chunk.toString()));

let browser;
try {
  await waitForServer(baseUrl);
  browser = await chromium.launch();
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    artifactDir,
    mode: "pages",
    publicStaticDemo: true,
    viewports: [],
    screenshots: [],
    failures: []
  };

  for (const viewport of viewports) {
    for (const state of states) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width <= 480 ? 2 : 1 });
      const page = await context.newPage();
      const label = `${viewport.id}-${state.id}`;
      const unexpectedApiCalls = [];
      try {
        await page.route("**/api/**", async (route) => {
          unexpectedApiCalls.push(route.request().url());
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "UX audit blocks daemon/private API calls in public static mode." })
          });
        });
        if (state.prepare) await state.prepare(page);
        await page.goto(`${baseUrl}/?uxAudit=${encodeURIComponent(label)}`, { waitUntil: "domcontentloaded" });
        await page.getByTestId("universe-canvas").waitFor({ state: "visible" });
        await page.waitForTimeout(650);
        await state.setup(page);
        await page.waitForTimeout(250);

        const audit = await page.evaluate(runBrowserAudit, browserPrivacyPatternSpecs);
        audit.unexpectedApiCalls = unexpectedApiCalls;
        const screenshotPath = join(artifactDir, `${label}.png`);
        const screenshot = await page.screenshot({ path: screenshotPath, fullPage: true });
        audit.viewport = viewport;
        audit.state = state.id;
        audit.screenshot = {
          path: screenshotPath,
          bytes: screenshot.length
        };
        audit.failures = failuresFor(audit);
        report.viewports.push(audit);
        report.screenshots.push(screenshotPath);
        report.failures.push(...audit.failures.map((failure) => ({ viewport: viewport.id, state: state.id, ...failure })));
      } finally {
        await context.close();
      }
    }
  }

  writeFileSync(join(artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(join(artifactDir, "report.md"), markdownReport(report), "utf8");

  if (report.failures.length) {
    console.error(`Cognopticon UX audit failed with ${report.failures.length} issue(s):`);
    for (const failure of report.failures) console.error(`- ${failure.viewport}/${failure.state}: ${failure.message}`);
    console.error(`Artifacts: ${artifactDir}`);
    process.exitCode = 1;
  } else {
    console.log(`Cognopticon UX audit valid: ${report.viewports.length} viewport states, ${report.screenshots.length} screenshots.`);
    console.log(`Artifacts: ${artifactDir}`);
  }
} finally {
  if (browser) await browser.close();
  await stopServer(server);
  writeFileSync(join(artifactDir, "server.log"), serverLog.join(""), "utf8");
}

function failuresFor(audit) {
  const failures = [];
  const touchTargetViewport = audit.viewport.width <= 940;
  const prefix = touchTargetViewport ? "touch" : "desktop";
  if (audit.privateLeaks.length) failures.push({ type: "privacy", message: `visible text leaks private/token-looking content: ${audit.privateLeaks.join(", ")}` });
  if (audit.unexpectedApiCalls.length) failures.push({ type: "daemon-isolation", message: `public UX audit made private API call(s): ${audit.unexpectedApiCalls.slice(0, 5).join(", ")}` });
  if (audit.scrollWidth > audit.innerWidth + 1) failures.push({ type: "overflow", message: `document has horizontal overflow ${audit.scrollWidth}px > ${audit.innerWidth}px` });
  if (audit.screenshot.bytes < 20_000) failures.push({ type: "screenshot", message: `screenshot artifact is suspiciously small (${audit.screenshot.bytes} bytes)` });
  if (audit.canvas.width < Math.min(320, audit.innerWidth - 24) || audit.canvas.height < 280) {
    failures.push({ type: "canvas", message: `canvas is too small (${Math.round(audit.canvas.width)}x${Math.round(audit.canvas.height)})` });
  }
  if (audit.canvas.dataUrlLength < 12_000 || audit.canvas.uniqueColors < 6 || audit.canvas.luminanceSpread < 18) {
    failures.push({ type: "canvas", message: `canvas looks blank or flat (data ${audit.canvas.dataUrlLength}, colors ${audit.canvas.uniqueColors}, luminance ${audit.canvas.luminanceSpread})` });
  }
  if (audit.colorDiversity.families.length < 3) {
    failures.push({ type: "palette", message: `visible UI uses too few accent hue families: ${audit.colorDiversity.families.join(", ") || "none"}` });
  }
  if (audit.clippedControls.length) failures.push({ type: "clipped-control", message: `clipped controls: ${audit.clippedControls.slice(0, 5).map((item) => item.label).join("; ")}` });
  if (audit.textOverflow.length) failures.push({ type: "text-overflow", message: `text overflow: ${audit.textOverflow.slice(0, 5).map((item) => item.label).join("; ")}` });
  if (audit.textOverlaps.length) failures.push({ type: "text-overlap", message: `overlapping visible text: ${audit.textOverlaps.slice(0, 5).map((item) => `${item.left} / ${item.right}`).join("; ")}` });
  if (audit.controlOverlaps.length) failures.push({ type: "control-overlap", message: `overlapping controls: ${audit.controlOverlaps.slice(0, 5).map((item) => `${item.left} / ${item.right}`).join("; ")}` });
  const tinyTargets = audit.tinyTargets.filter((item) => {
    const min = touchTargetViewport && item.primary ? 43.5 : 24;
    return item.width < min || item.height < min;
  });
  if (tinyTargets.length) failures.push({ type: "target-size", message: `undersized ${prefix} targets: ${tinyTargets.slice(0, 5).map((item) => `${item.label} ${Math.round(item.width)}x${Math.round(item.height)}`).join("; ")}` });
  return failures;
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const closed = new Promise((resolveClose) => child.once("close", resolveClose));
  child.kill("SIGTERM");
  const timer = new Promise((resolveTimer) => setTimeout(resolveTimer, 2500, "timeout"));
  if (await Promise.race([closed, timer]) === "timeout" && child.exitCode === null) child.kill("SIGKILL");
}

async function waitForServer(url) {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    if (server.exitCode !== null) throw new Error(`Vite server exited early with ${server.exitCode}:\n${serverLog.join("")}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  throw new Error(`Timed out waiting for ${url}:\n${serverLog.join("")}`);
}

async function clickFirstActionable(locator) {
  const count = await locator.count();
  const failures = [];
  const visibleCandidates = [];
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (!(await candidate.isVisible())) continue;
    visibleCandidates.push(candidate);
    try {
      await candidate.click({ trial: true, timeout: 1200 });
      await candidate.click();
      return;
    } catch (error) {
      failures.push(error instanceof Error ? error.message.split("\n")[0] : String(error));
    }
  }
  if (visibleCandidates.length) {
    await visibleCandidates[0].evaluate((element) => element.click());
    return;
  }
  throw new Error(`No visible actionable candidate found for locator; tried ${count}: ${failures.join("; ")}`);
}

function markdownReport(report) {
  const lines = [
    "# Cognopticon UX Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Base URL: ${report.baseUrl}`,
    `Mode: ${report.mode}`,
    `Public static demo: ${report.publicStaticDemo ? "yes" : "no"}`,
    `States: ${report.viewports.length}`,
    `Failures: ${report.failures.length}`,
    "",
    "## Viewports",
    ""
  ];
  for (const audit of report.viewports) {
    lines.push(`- ${audit.viewport.id} / ${audit.state}: screenshot ${audit.screenshot.bytes} bytes, canvas ${Math.round(audit.canvas.width)}x${Math.round(audit.canvas.height)}, colors ${audit.canvas.uniqueColors}, palette ${audit.colorDiversity.families.join("/")}, failures ${audit.failures.length}`);
  }
  if (report.failures.length) {
    lines.push("", "## Failures", "");
    for (const failure of report.failures) lines.push(`- ${failure.viewport} / ${failure.state}: ${failure.message}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function runBrowserAudit(privacyPatternSpecs) {
  const auditCanvas = (canvas) => {
    const sample = document.createElement("canvas");
    sample.width = 72;
    sample.height = 72;
    const context = sample.getContext("2d", { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const data = context.getImageData(0, 0, sample.width, sample.height).data;
    const colors = new Set();
    let minLum = 255;
    let maxLum = 0;
    for (let index = 0; index < data.length; index += 16) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      if (alpha < 20) continue;
      colors.add(`${red >> 4},${green >> 4},${blue >> 4}`);
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      minLum = Math.min(minLum, luminance);
      maxLum = Math.max(maxLum, luminance);
    }
    return {
      width: canvas.getBoundingClientRect().width,
      height: canvas.getBoundingClientRect().height,
      dataUrlLength: canvas.toDataURL("image/png").length,
      uniqueColors: colors.size,
      luminanceSpread: Math.round(maxLum - minLum)
    };
  };
  const visibleElement = (element) => {
    const details = element.closest("details");
    if (details && !details.open && !element.closest("summary")) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  };
  const colorDiversity = () => {
    const families = new Map();
    const elements = Array.from(document.querySelectorAll("body, body *"))
      .filter(visibleElement)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
      });

    for (const element of elements) {
      const style = window.getComputedStyle(element);
      for (const value of [
        style.color,
        style.backgroundColor,
        style.borderTopColor,
        style.borderRightColor,
        style.borderBottomColor,
        style.borderLeftColor,
        style.outlineColor
      ]) {
        const color = parseColor(value);
        if (!color || color.alpha < 0.12) continue;
        const hsl = rgbToHsl(color.red, color.green, color.blue);
        if (hsl.saturation < 0.18 || hsl.lightness < 0.08 || hsl.lightness > 0.96) continue;
        const family = hueFamily(hsl.hue);
        families.set(family, (families.get(family) ?? 0) + 1);
      }
    }

    return {
      families: [...families.entries()].sort((left, right) => right[1] - left[1]).map(([family]) => family),
      counts: Object.fromEntries([...families.entries()].sort((left, right) => left[0].localeCompare(right[0])))
    };
  };
  const labelOf = (element) => {
    const text = element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || element.tagName;
    return text.trim().replace(/\s+/g, " ").slice(0, 100) || element.tagName;
  };
  const rectOf = (element) => {
    const rect = element.getBoundingClientRect();
    const visible = visibleRectFor(element, rect);
    const controlLabel = isControlLabel(element);
    return {
      label: labelOf(element),
      tag: element.tagName,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      visibleWidth: visible.width,
      visibleHeight: visible.height,
      visibleRatio: rect.width * rect.height ? visible.width * visible.height / (rect.width * rect.height) : 0,
      primary: controlLabel || ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"].includes(element.tagName),
      controlLabel
    };
  };
  const visibleRectFor = (element, rect) => {
    let left = Math.max(rect.left, 0);
    let right = Math.min(rect.right, window.innerWidth);
    let top = Math.max(rect.top, 0);
    let bottom = Math.min(rect.bottom, window.innerHeight);
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor);
      if (!/(auto|scroll|hidden|clip)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`)) continue;
      const ancestorRect = ancestor.getBoundingClientRect();
      left = Math.max(left, ancestorRect.left);
      right = Math.min(right, ancestorRect.right);
      top = Math.max(top, ancestorRect.top);
      bottom = Math.min(bottom, ancestorRect.bottom);
    }
    return {
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top)
    };
  };
  const actionables = Array.from(document.querySelectorAll("button, input:not([type='hidden']):not([type='checkbox']):not([type='radio']), select, textarea, a[href], summary, label"))
    .filter(visibleElement)
    .filter((element) => element.tagName !== "LABEL" || isControlLabel(element))
    .map((element) => ({ element, rect: rectOf(element) }));
  const inViewport = ({ rect }) => rect.visibleRatio > 0.85 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  const viewportActionables = actionables.filter(inViewport);
  const textBlocks = Array.from(document.querySelectorAll("h1, h2, h3, h4, p, small, strong, summary, button, a, label span, .project-label, .metric span, .proposal-card, .task-summary-copy"))
    .filter(visibleElement)
    .filter((element) => !element.closest("[aria-hidden='true']"))
    .map((element) => ({ element, rect: rectOf(element) }))
    .filter(inViewport)
    .filter(({ rect }) => rect.width > 8 && rect.height > 8);
  const controlOverlaps = [];
  for (let leftIndex = 0; leftIndex < viewportActionables.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < viewportActionables.length; rightIndex += 1) {
      const leftElement = viewportActionables[leftIndex].element;
      const rightElement = viewportActionables[rightIndex].element;
      if (leftElement.contains(rightElement) || rightElement.contains(leftElement)) continue;
      if (!canInteractTogether(leftElement, rightElement)) continue;
      const left = viewportActionables[leftIndex].rect;
      const right = viewportActionables[rightIndex].rect;
      const overlapWidth = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
      const overlapHeight = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
      const area = overlapWidth * overlapHeight;
      if (area > 4) controlOverlaps.push({ left: left.label, right: right.label, area: Math.round(area) });
    }
  }
  const textOverflow = Array.from(new Set([
    ...viewportActionables.map(({ element }) => element),
    ...textBlocks.map(({ element }) => element)
  ]))
    .filter((element) => !allowsTextTruncation(element))
    .map((element) => ({ element, rect: rectOf(element) }))
    .filter(inViewport)
    .filter(({ rect }) => rect.width > 8 && rect.height > 8)
    .filter(({ element }) => hasTextOverflow(element))
    .map(({ rect }) => rect);
  const clippedControls = viewportActionables
    .map(({ rect }) => rect)
    .filter((rect) => rect.left < -1 || rect.right > window.innerWidth + 1 || rect.top < -1 || rect.bottom > window.innerHeight + 1);
  const tinyTargets = viewportActionables
    .map(({ rect }) => rect)
    .filter((rect) => rect.width < 43.5 || rect.height < 43.5);
  const inputValues = Array.from(document.querySelectorAll("input, textarea, select"))
    .map((element) => "value" in element ? element.value : "")
    .filter(Boolean)
    .join("\n");
  const visibleText = `${document.body.innerText || ""}\n${inputValues}`;
  const privateLeaks = privacyPatternSpecs
    .map(({ label, source, flags }) => ({ label, pattern: new RegExp(source, flags) }))
    .filter(({ pattern }) => pattern.test(visibleText))
    .map(({ label }) => label);
  const textOverlaps = textOverlapPairs(textBlocks);
  const canvas = document.querySelector("[data-testid='universe-canvas']");
  const canvasAudit = canvas ? auditCanvas(canvas) : {
    width: 0,
    height: 0,
    dataUrlLength: 0,
    uniqueColors: 0,
    luminanceSpread: 0
  };
  return {
    url: window.location.href,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    canvas: canvasAudit,
    actionables: actionables.map(({ rect }) => rect),
    clippedControls,
    textOverflow,
    textBlocks: textBlocks.map(({ rect }) => rect),
    textOverlaps,
    tinyTargets,
    controlOverlaps,
    privateLeaks,
    colorDiversity: colorDiversity()
  };

  function parseColor(value) {
    const match = String(value).match(/^rgba?\(([^)]+)\)$/);
    if (!match) return undefined;
    const [red, green, blue, alpha = "1"] = match[1].replace(/\s*\/\s*/g, " ").split(/[\s,]+/).filter(Boolean);
    const channelValues = [Number(red), Number(green), Number(blue), Number(alpha)];
    if (!channelValues.every(Number.isFinite)) return undefined;
    return {
      red: channelValues[0],
      green: channelValues[1],
      blue: channelValues[2],
      alpha: channelValues[3]
    };
  }

  function rgbToHsl(red, green, blue) {
    const r = red / 255;
    const g = green / 255;
    const b = blue / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    const delta = max - min;
    if (delta === 0) return { hue: 0, saturation: 0, lightness };
    const saturation = delta / (1 - Math.abs(2 * lightness - 1));
    let hue;
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
    if (hue < 0) hue += 360;
    return { hue, saturation, lightness };
  }

  function hueFamily(hue) {
    if (hue < 25 || hue >= 330) return "rose";
    if (hue < 75) return "amber";
    if (hue < 165) return "green";
    if (hue < 225) return "cyan";
    if (hue < 285) return "violet";
    return "magenta";
  }

  function textOverlapPairs(items) {
    const overlaps = [];
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const leftElement = items[leftIndex].element;
        const rightElement = items[rightIndex].element;
        if (leftElement.contains(rightElement) || rightElement.contains(leftElement)) continue;
        if (!canInteractTogether(leftElement, rightElement)) continue;
        const left = items[leftIndex].rect;
        const right = items[rightIndex].rect;
        const overlapWidth = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
        const overlapHeight = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
        const area = overlapWidth * overlapHeight;
        const smaller = Math.min(left.width * left.height, right.width * right.height);
        if (area > 20 && area / Math.max(1, smaller) > 0.18) overlaps.push({ left: left.label, right: right.label, area: Math.round(area) });
      }
    }
    return overlaps;
  }

  function hasTextOverflow(element) {
    if (!element.textContent?.trim()) return false;
    const horizontalOverflow = element.scrollWidth > element.clientWidth + 1;
    const verticalOverflow = element.scrollHeight > element.clientHeight + 1;
    return horizontalOverflow || verticalOverflow;
  }

  function allowsTextTruncation(element) {
    return Boolean(["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName) || element.closest(".project-label") || element.matches(".task-card small"));
  }

  function isControlLabel(element) {
    return element.tagName === "LABEL" && Boolean(element.querySelector("input[type='checkbox'], input[type='radio']"));
  }

  function canInteractTogether(left, right) {
    const overlaySelector = ".drawer-backdrop, .filter-popover, .queue-popover, .dossier-panel";
    const leftOverlay = left.closest(overlaySelector);
    const rightOverlay = right.closest(overlaySelector);
    if (leftOverlay || rightOverlay) return leftOverlay === rightOverlay;
    return true;
  }
}
