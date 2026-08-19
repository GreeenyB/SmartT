import { createServer } from "vite";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(__dirname, "../..");
const outputDir = path.join(dashboardRoot, "output", "demo");
const reviewDir = path.join(outputDir, "review");
const rawVideoPath = path.join(outputDir, "SmartT_BKI_Demo_Raw.webm");
const tempVideoPath = path.join(outputDir, "SmartT_BKI_Demo_Raw.tmp.webm");
const previousVideoPath = path.join(outputDir, "SmartT_BKI_Demo_Raw.previous.webm");
const failureScreenshotPath = path.join(outputDir, "failure.png");
const runReportPath = path.join(outputDir, "demo-run.json");

const PORT = 45873;
const HOST = "127.0.0.1";
const VIEWPORT = { width: 1920, height: 1080 };
const DEMO_URL = `http://${HOST}:${PORT}/?capture=1`;
const TARGETS = {
  OVERVIEW_LOSS_KPI: "overview-loss-kpi",
  OVERVIEW_OPEN_ALERTS_KPI: "overview-open-alerts-kpi",
  NOTIFICATION_BELL: "notification-bell",
  HERO_NOTIFICATION: "hero-notification",
  ALERT_HERO_EVENT: "alert-hero-event",
  ALERT_EVIDENCE: "alert-evidence",
  ALERT_MEASUREMENT: "alert-measurement",
  ALERT_VEHICLE_CONTEXT: "alert-vehicle-context",
  ALERT_LOCATION: "alert-location",
  ALERT_FUEL_TREND: "alert-fuel-trend",
  ALERT_MARK_VERIFIED: "alert-mark-verified",
  SIDEBAR_OVERVIEW: "sidebar-overview",
};

const BEATS = {
  cursorAppears: 1800,
  incident: 2600,
  bell: 4800,
  heroNotification: 6600,
  alertHold: 8300,
  measurement: 10800,
  vehicleContext: 13600,
  trend: 16400,
  location: 19500,
  verify: 22000,
  verifiedHold: 24000,
  overviewReturn: 26000,
  endingHold: 28000,
  stop: 30000,
};

const args = new Set(process.argv.slice(2));
const headed = args.has("--headed");

const report = {
  status: "RUNNING",
  video: rawVideoPath,
  viewport: [VIEWPORT.width, VIEWPORT.height],
  browser: "Chromium",
  recordingApi: "page.screencast",
  server: { host: HOST, port: PORT, strategy: "programmatic Vite dev server" },
  startedAt: new Date().toISOString(),
  endedAt: null,
  durationMs: null,
  failedStep: null,
  error: null,
  currentUrl: null,
  currentStage: null,
  heroAlertReadyMs: null,
  measurementActualMs: null,
  heroAlertHoldMs: null,
  browserConsole: [],
  steps: [],
};

let browser;
let context;
let page;
let server;
let screencastStarted = false;
let recordingStartedAt = 0;
let heroAlertReadyAt = null;
let activeStep = "startup";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function videoTimeMs() {
  return performance.now() - recordingStartedAt;
}

async function ensureOutputDirs() {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(reviewDir, { recursive: true });
}

async function writeReport(extra = {}) {
  Object.assign(report, extra);
  report.endedAt = report.endedAt ?? new Date().toISOString();
  await fs.writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function waitUntilVideoTime(scheduledMs) {
  const remaining = scheduledMs - videoTimeMs();
  if (remaining > 0) {
    await sleep(remaining);
  }
}

async function recordStep(name, scheduledMs, run) {
  activeStep = name;
  await waitUntilVideoTime(scheduledMs);
  const actualMs = Math.round(videoTimeMs());
  const entry = {
    name,
    scheduledMs,
    actualMs,
    driftMs: actualMs - scheduledMs,
  };
  report.steps.push(entry);
  console.log(`[demo] ${name}: scheduled=${scheduledMs}ms actual=${actualMs}ms drift=${entry.driftMs}ms`);
  await run();
}

async function recordMeasurementStep(run) {
  activeStep = "show measurement evidence";
  const minHeroAlertHoldMs = 1300;
  const earliestByReady =
    heroAlertReadyAt == null ? BEATS.measurement : heroAlertReadyAt + minHeroAlertHoldMs;
  const scheduledMs = Math.max(BEATS.measurement, earliestByReady);
  await waitUntilVideoTime(scheduledMs);
  const actualMs = Math.round(videoTimeMs());
  const heroAlertHoldMs = heroAlertReadyAt == null ? null : actualMs - heroAlertReadyAt;
  const entry = {
    name: "show measurement evidence",
    scheduledMs: BEATS.measurement,
    actualMs,
    driftMs: actualMs - BEATS.measurement,
    heroAlertReadyMs: heroAlertReadyAt,
    heroAlertHoldMs,
  };
  report.steps.push(entry);
  report.measurementActualMs = actualMs;
  report.heroAlertHoldMs = heroAlertHoldMs;
  console.log(
    `[demo] show measurement evidence: scheduled=${BEATS.measurement}ms actual=${actualMs}ms drift=${entry.driftMs}ms heroHold=${heroAlertHoldMs ?? "unknown"}ms`,
  );
  await run();
}

async function evaluateDemo(fn, arg) {
  return page.evaluate(
    async ({ source, input }) => {
      const demo = window.__SMARTT_DEMO__;
      if (!demo) throw new Error("window.__SMARTT_DEMO__ is not installed.");
      const run = new Function("demo", "input", `return (${source})(demo, input);`);
      return await run(demo, input);
    },
    { source: fn.toString(), input: arg },
  );
}

async function getStage() {
  return evaluateDemo((demo) => demo.getStage());
}

async function assertStage(expected) {
  const actual = await getStage();
  if (actual !== expected) {
    throw new Error(`Expected demo stage ${expected}, got ${actual}.`);
  }
}

async function assertTarget(target) {
  await evaluateDemo((demo, targetName) => demo.waitForTarget(targetName, 2200), target);
}

async function assertTargetText(target, patterns) {
  await assertTarget(target);
  const text = await page.evaluate(
    ({ targetName }) => document.querySelector(`[data-demo-target="${targetName}"]`)?.textContent ?? "",
    { targetName: target },
  );
  for (const pattern of patterns) {
    if (!new RegExp(pattern, "i").test(text)) {
      throw new Error(`Target ${target} did not contain expected text /${pattern}/i. Saw: ${text.trim()}`);
    }
  }
}

async function waitForDemoReady() {
  await page.goto(DEMO_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
  await page.waitForFunction(() => Boolean(window.__SMARTT_DEMO__), null, { timeout: 15000 });
  await page.waitForFunction(() => window.__SMARTT_DEMO__?.isReady() === true, null, { timeout: 15000 });
  await evaluateDemo((demo) => {
    demo.reset();
    demo.hideCursor();
  });
  await assertStage("NORMAL");
  if (new URL(page.url()).pathname !== "/") {
    throw new Error(`Expected Overview route before recording, got ${page.url()}.`);
  }
  await assertTarget(TARGETS.OVERVIEW_LOSS_KPI);
  await assertTargetText(TARGETS.OVERVIEW_LOSS_KPI, ["0", "L"]);
  await assertTargetText(TARGETS.OVERVIEW_OPEN_ALERTS_KPI, ["4"]);
  await sleep(800);
}

async function startServer() {
  server = await createServer({
    configFile: path.join(dashboardRoot, "vite.config.ts"),
    root: dashboardRoot,
    server: {
      host: HOST,
      port: PORT,
      strictPort: true,
    },
    logLevel: "warn",
  });
  await server.listen();
  console.log(`[demo] Dashboard server ready at ${DEMO_URL}`);
}

async function startBrowser() {
  browser = await chromium.launch({ headless: !headed });
  context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      report.browserConsole.push({
        type: message.type(),
        text: message.text(),
      });
      console.log(`[browser:${message.type()}] ${message.text()}`);
    }
  });
}

async function startScreencast() {
  if (!page.screencast?.start || !page.screencast?.stop) {
    throw new Error("Installed Playwright does not support page.screencast.start/stop.");
  }
  await fs.rm(tempVideoPath, { force: true });
  await page.screencast.start({
    path: tempVideoPath,
    size: VIEWPORT,
    quality: 92,
  });
  screencastStarted = true;
  recordingStartedAt = performance.now();
}

async function stopScreencast() {
  if (!screencastStarted) return;
  screencastStarted = false;
  await page.screencast.stop();
}

async function publishSuccessfulVideo() {
  const tempStat = await fs.stat(tempVideoPath);
  if (!tempStat.size) {
    throw new Error(`Raw video was created but is empty: ${tempVideoPath}`);
  }

  await fs.rm(previousVideoPath, { force: true });
  let movedExisting = false;
  try {
    await fs.rename(rawVideoPath, previousVideoPath);
    movedExisting = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  try {
    await fs.rename(tempVideoPath, rawVideoPath);
    if (movedExisting) await fs.rm(previousVideoPath, { force: true });
  } catch (error) {
    if (movedExisting) {
      await fs.rename(previousVideoPath, rawVideoPath).catch(() => undefined);
    }
    throw error;
  }
}

async function captureReviewScreenshots() {
  await page.screenshot({ path: path.join(reviewDir, "04-verified.png"), fullPage: false });
}

async function runStoryboard() {
  await startScreencast();

  await recordStep("normal overview hold", 0, async () => {
    await assertStage("NORMAL");
  });

  await recordStep("show cursor", BEATS.cursorAppears, async () => {
    await evaluateDemo((demo) => demo.showCursor());
  });

  await recordStep("trigger incident from loss KPI", BEATS.incident, async () => {
    await evaluateDemo((demo, targetName) => demo.moveCursorTo(targetName, { durationMs: 720 }), TARGETS.OVERVIEW_LOSS_KPI);
    await evaluateDemo((demo) => demo.triggerIncident());
    await assertStage("INCIDENT");
  });

  await recordStep("open notification bell", BEATS.bell, async () => {
    await assertTargetText(TARGETS.OVERVIEW_LOSS_KPI, ["58", "L"]);
    await assertTargetText(TARGETS.OVERVIEW_OPEN_ALERTS_KPI, ["5"]);
    await evaluateDemo((demo, targetName) => demo.moveCursorTo(targetName, { durationMs: 620 }), TARGETS.NOTIFICATION_BELL);
    await evaluateDemo((demo, targetName) => demo.clickTarget(targetName), TARGETS.NOTIFICATION_BELL);
    await assertTarget(TARGETS.HERO_NOTIFICATION);
  });

  await recordStep("open hero notification", BEATS.heroNotification, async () => {
    await evaluateDemo((demo, targetName) => demo.moveCursorTo(targetName, { durationMs: 460 }), TARGETS.HERO_NOTIFICATION);
    await evaluateDemo((demo, targetName) => demo.clickTarget(targetName), TARGETS.HERO_NOTIFICATION);
    await page.waitForURL(/\/alerts(?:\?|$)/, { timeout: 5000 });
    await assertTarget(TARGETS.ALERT_HERO_EVENT);
    heroAlertReadyAt = Math.round(videoTimeMs());
    report.heroAlertReadyMs = heroAlertReadyAt;
    console.log(`[demo] hero alert ready at ${heroAlertReadyAt}ms`);
  });

  await recordStep("hero alert selected hold", BEATS.alertHold, async () => {
    await assertTargetText(TARGETS.ALERT_HERO_EVENT, ["63F-431\\.20", "Fuel"]);
    await assertTarget(TARGETS.ALERT_EVIDENCE);
  });

  await recordMeasurementStep(async () => {
    await evaluateDemo((demo, targetName) => demo.scrollTargetIntoView(targetName, { durationMs: 620, block: "center" }), TARGETS.ALERT_MEASUREMENT);
    await evaluateDemo((demo, targetName) => demo.moveCursorTo(targetName, { durationMs: 520, anchor: "left" }), TARGETS.ALERT_MEASUREMENT);
    await assertTargetText(TARGETS.ALERT_MEASUREMENT, ["58", "L"]);
    await assertTargetText(TARGETS.ALERT_EVIDENCE, ["92%", "78%"]);
  });

  await recordStep("show vehicle context", BEATS.vehicleContext, async () => {
    await evaluateDemo((demo, targetName) => demo.scrollTargetIntoView(targetName, { durationMs: 640, block: "center" }), TARGETS.ALERT_VEHICLE_CONTEXT);
    await evaluateDemo((demo, targetName) => demo.moveCursorTo(targetName, { durationMs: 520, anchor: "left" }), TARGETS.ALERT_VEHICLE_CONTEXT);
    await assertTargetText(TARGETS.ALERT_EVIDENCE, ["Off", "0", "Can Tho Depot Yard"]);
  });

  await recordStep("show event-day fuel trend", BEATS.trend, async () => {
    await evaluateDemo((demo, targetName) => demo.scrollTargetIntoView(targetName, { durationMs: 720, block: "center" }), TARGETS.ALERT_FUEL_TREND);
    await assertTarget(TARGETS.ALERT_FUEL_TREND);
  });

  await recordStep("show location evidence", BEATS.location, async () => {
    await evaluateDemo((demo, targetName) => demo.scrollTargetIntoView(targetName, { durationMs: 620, block: "center" }), TARGETS.ALERT_LOCATION);
    await assertTarget(TARGETS.ALERT_LOCATION);
  });

  await recordStep("mark verified through real button", BEATS.verify, async () => {
    await evaluateDemo((demo, targetName) => demo.scrollTargetIntoView(targetName, { durationMs: 520, block: "center" }), TARGETS.ALERT_MARK_VERIFIED);
    await evaluateDemo((demo, targetName) => demo.moveCursorTo(targetName, { durationMs: 520 }), TARGETS.ALERT_MARK_VERIFIED);
    await evaluateDemo((demo, targetName) => demo.clickTarget(targetName), TARGETS.ALERT_MARK_VERIFIED);
    await assertStage("VERIFIED");
  });

  await recordStep("verified result hold", BEATS.verifiedHold, async () => {
    await assertStage("VERIFIED");
    await assertTargetText(TARGETS.ALERT_EVIDENCE, ["58", "Verified"]);
  });

  await recordStep("return to overview", BEATS.overviewReturn, async () => {
    await evaluateDemo((demo, targetName) => demo.moveCursorTo(targetName, { durationMs: 640 }), TARGETS.SIDEBAR_OVERVIEW);
    await evaluateDemo((demo, targetName) => demo.clickTarget(targetName), TARGETS.SIDEBAR_OVERVIEW);
    await page.waitForURL(/\/(?:\?|$)/, { timeout: 5000 });
    await assertTarget(TARGETS.OVERVIEW_LOSS_KPI);
  });

  await recordStep("final overview hold and hide cursor", BEATS.endingHold, async () => {
    await assertTargetText(TARGETS.OVERVIEW_LOSS_KPI, ["58", "L"]);
    await assertTargetText(TARGETS.OVERVIEW_OPEN_ALERTS_KPI, ["4"]);
    await evaluateDemo((demo) => demo.hideCursor());
  });

  await waitUntilVideoTime(BEATS.stop);
  report.durationMs = Math.round(videoTimeMs());
  await stopScreencast();
  await publishSuccessfulVideo();
  await captureReviewScreenshots();
}

async function closeEverything() {
  await stopScreencast().catch((error) => console.log(`[demo] screencast stop during cleanup failed: ${error.message}`));
  if (page) await page.close().catch(() => undefined);
  if (context) await context.close().catch(() => undefined);
  if (browser) await browser.close().catch(() => undefined);
  if (server) await server.close().catch(() => undefined);
}

async function main() {
  await ensureOutputDirs();
  await startServer();
  await startBrowser();
  await waitForDemoReady();
  await runStoryboard();
  const videoStat = await fs.stat(rawVideoPath);
  await writeReport({
    status: "PASS",
    video: rawVideoPath,
    videoSizeBytes: videoStat.size,
    currentUrl: page.url(),
    currentStage: await getStage(),
  });
  console.log(`[demo] PASS ${rawVideoPath}`);
  console.log(`[demo] Raw video size ${videoStat.size} bytes`);
}

main()
  .catch(async (error) => {
    console.error(`[demo] FAIL in step "${activeStep}": ${error.stack || error.message}`);
    let currentUrl = null;
    let currentStage = null;
    try {
      currentUrl = page?.url() ?? null;
      currentStage = page ? await getStage() : null;
    } catch {
      currentStage = null;
    }
    try {
      if (page) {
        await fs.mkdir(outputDir, { recursive: true });
        await page.screenshot({ path: failureScreenshotPath, fullPage: false });
      }
    } catch (screenshotError) {
      console.error(`[demo] Could not write failure screenshot: ${screenshotError.message}`);
    }
    await writeReport({
      status: "FAIL",
      failedStep: activeStep,
      error: error.message,
      durationMs: recordingStartedAt ? Math.round(videoTimeMs()) : null,
      currentUrl,
      currentStage,
    }).catch((reportError) => console.error(`[demo] Could not write failure report: ${reportError.message}`));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeEverything();
  });
