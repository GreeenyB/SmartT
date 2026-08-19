import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(dashboardRoot, "../..");
const websiteRoot = path.join(repoRoot, "apps", "website");
const outputDir = path.join(dashboardRoot, "output", "showcase");
const websiteOutputDir = path.join(outputDir, "website");
const reviewDir = path.join(outputDir, "review");
const failureScreenshotPath = path.join(outputDir, "failure.png");
const runReportPath = path.join(outputDir, "showcase-run.json");
const geometryQaPath = path.join(websiteOutputDir, "geometry-qa.json");
const bridgeQaPath = path.join(websiteOutputDir, "bridge-qa.json");

const HOST = "127.0.0.1";
const WEBSITE_PORT = 45901;
const DASHBOARD_PORT = 45902;
const VIEWPORT = { width: 1920, height: 1080 };
const SAFE_FRAME = { top: 112, bottom: 1008 };
const websiteUrl = `http://${HOST}:${WEBSITE_PORT}/`;
const dashboardUrl = `http://${HOST}:${DASHBOARD_PORT}/`;

const dashboardClip = {
  key: "dashboard",
  name: "Dashboard Tour",
  fileName: "02_Dashboard_Tour.webm",
  tempName: "02_Dashboard_Tour.tmp.webm",
  previousName: "02_Dashboard_Tour.previous.webm",
  directory: outputDir,
};

const websiteShots = {
  W01: {
    key: "W01",
    name: "W01 Hero + Problem",
    fileName: "W01_Hero_Problem.webm",
    tempName: "W01_Hero_Problem.tmp.webm",
    previousName: "W01_Hero_Problem.previous.webm",
    directory: websiteOutputDir,
  },
  W02: {
    key: "W02",
    name: "W02 Architecture",
    fileName: "W02_Architecture.webm",
    tempName: "W02_Architecture.tmp.webm",
    previousName: "W02_Architecture.previous.webm",
    directory: websiteOutputDir,
  },
  W02A: {
    key: "W02A",
    name: "W02A Architecture 01-02",
    fileName: "W02A_Architecture_01_02.webm",
    tempName: "W02A_Architecture_01_02.tmp.webm",
    previousName: "W02A_Architecture_01_02.previous.webm",
    directory: websiteOutputDir,
  },
  W02B: {
    key: "W02B",
    name: "W02B Architecture 03-04",
    fileName: "W02B_Architecture_03_04.webm",
    tempName: "W02B_Architecture_03_04.tmp.webm",
    previousName: "W02B_Architecture_03_04.previous.webm",
    directory: websiteOutputDir,
  },
  W03: {
    key: "W03",
    name: "W03 Product Bridge Optional",
    fileName: "W03_Product_Bridge_Optional.webm",
    tempName: "W03_Product_Bridge_Optional.tmp.webm",
    previousName: "W03_Product_Bridge_Optional.previous.webm",
    directory: websiteOutputDir,
  },
  W04: {
    key: "W04",
    name: "W04 Platform Desktop",
    fileName: "W04_Platform_Desktop.webm",
    tempName: "W04_Platform_Desktop.tmp.webm",
    previousName: "W04_Platform_Desktop.previous.webm",
    directory: websiteOutputDir,
  },
  W05: {
    key: "W05",
    name: "W05 Platform Mobile",
    fileName: "W05_Platform_Mobile.webm",
    tempName: "W05_Platform_Mobile.tmp.webm",
    previousName: "W05_Platform_Mobile.previous.webm",
    directory: websiteOutputDir,
  },
  W05A: {
    key: "W05A",
    name: "W05A Mobile Live + Vehicle",
    fileName: "W05A_Mobile_Live_Vehicle.webm",
    tempName: "W05A_Mobile_Live_Vehicle.tmp.webm",
    previousName: "W05A_Mobile_Live_Vehicle.previous.webm",
    directory: websiteOutputDir,
  },
  W05B: {
    key: "W05B",
    name: "W05B Mobile Evidence",
    fileName: "W05B_Mobile_Evidence.webm",
    tempName: "W05B_Mobile_Evidence.tmp.webm",
    previousName: "W05B_Mobile_Evidence.previous.webm",
    directory: websiteOutputDir,
  },
  W06: {
    key: "W06",
    name: "W06 Open Console",
    fileName: "W06_Open_Console.webm",
    tempName: "W06_Open_Console.tmp.webm",
    previousName: "W06_Open_Console.previous.webm",
    directory: websiteOutputDir,
  },
};

const websiteBridges = {
  B01: {
    key: "B01",
    name: "B01 Problem to Architecture",
    fileName: "B01_Problem_to_Architecture.webm",
    tempName: "B01_Problem_to_Architecture.tmp.webm",
    previousName: "B01_Problem_to_Architecture.previous.webm",
    directory: websiteOutputDir,
    sourceShot: "W01",
    destinationShot: "W02",
    sourceEndpoint: "Problem observation",
    destinationEndpoint: "Architecture observation",
    direction: "down",
    travelDurationMs: 880,
  },
  B02: {
    key: "B02",
    name: "B02 Architecture to Desktop",
    fileName: "B02_Architecture_to_Desktop.webm",
    tempName: "B02_Architecture_to_Desktop.tmp.webm",
    previousName: "B02_Architecture_to_Desktop.previous.webm",
    directory: websiteOutputDir,
    sourceShot: "W02",
    destinationShot: "W04",
    sourceEndpoint: "Architecture observation",
    destinationEndpoint: "Platform desktop observation",
    direction: "down",
    travelDurationMs: 1160,
  },
  B03: {
    key: "B03",
    name: "B03 Desktop to Mobile",
    fileName: "B03_Desktop_to_Mobile.webm",
    tempName: "B03_Desktop_to_Mobile.tmp.webm",
    previousName: "B03_Desktop_to_Mobile.previous.webm",
    directory: websiteOutputDir,
    sourceShot: "W04",
    destinationShot: "W05",
    sourceEndpoint: "Platform desktop observation",
    destinationEndpoint: "Platform mobile observation",
    direction: "down",
    travelDurationMs: 760,
  },
  B04: {
    key: "B04",
    name: "B04 Mobile to Desktop",
    fileName: "B04_Mobile_to_Desktop.webm",
    tempName: "B04_Mobile_to_Desktop.tmp.webm",
    previousName: "B04_Mobile_to_Desktop.previous.webm",
    directory: websiteOutputDir,
    sourceShot: "W05",
    destinationShot: "W06",
    sourceEndpoint: "Platform mobile observation",
    destinationEndpoint: "Open console action",
    direction: "up",
    travelDurationMs: 900,
  },
};

const VALID_COMMANDS = new Set(["website", "dashboard", "all", "bridges"]);
const command = process.argv[2] ?? "all";
const headed = process.argv.includes("--headed");
const selectedWebsiteShots = (() => {
  const shotArg = process.argv.find((arg) => arg.startsWith("--website-shots=") || arg.startsWith("--shots="));
  if (!shotArg) return null;
  const [, value = ""] = shotArg.split("=");
  const shots = value
    .split(",")
    .map((shot) => shot.trim().toUpperCase())
    .filter(Boolean);
  const validShots = new Set(["W01", "W02", "W03", "W04", "W05", "W06"]);
  for (const shot of shots) {
    if (!validShots.has(shot)) throw new Error(`Unknown website shot "${shot}". Expected one of ${Array.from(validShots).join(", ")}.`);
  }
  return new Set(shots);
})();

const report = {
  status: "RUNNING",
  viewport: [VIEWPORT.width, VIEWPORT.height],
  browser: "Chromium",
  recordingApi: "page.screencast",
  servers: {},
  clips: {},
  startedAt: new Date().toISOString(),
  endedAt: null,
  failedClip: null,
  failedScene: null,
  currentUrl: null,
  error: null,
  browserConsole: [],
};

const geometryQa = {
  safeFrame: SAFE_FRAME,
  viewport: VIEWPORT,
  generatedAt: null,
  shots: [],
};

const bridgeQa = {
  viewport: VIEWPORT,
  fps: 25,
  codec: "VP8 WebM",
  generatedAt: null,
  bridges: [],
};

let browser;
let activeContext;
let activePage;
let activeClipKey = null;
let activeScene = "startup";
const servers = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function ensureOutputDirs() {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(websiteOutputDir, { recursive: true });
  await fs.mkdir(reviewDir, { recursive: true });
}

async function writeReport(extra = {}) {
  Object.assign(report, extra);
  report.endedAt = new Date().toISOString();
  await fs.writeFile(runReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function writeGeometryQa() {
  geometryQa.generatedAt = new Date().toISOString();
  await fs.writeFile(geometryQaPath, `${JSON.stringify(geometryQa, null, 2)}\n`, "utf8");
}

async function writeBridgeQa() {
  bridgeQa.generatedAt = new Date().toISOString();
  await fs.writeFile(bridgeQaPath, `${JSON.stringify(bridgeQa, null, 2)}\n`, "utf8");
}

async function waitForHttpReady(url, timeoutMs = 60000) {
  const startedAt = performance.now();
  let lastError = null;
  while (performance.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      const text = await response.text();
      if (response.ok && !text.includes("Cannot GET")) return;
      lastError = new Error(`HTTP ${response.status} while waiting for ${url}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "unknown readiness error"}`);
}

async function startViteCliServer({ key, name, root, port, env = {} }) {
  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  try {
    await fs.access(viteBin);
  } catch {
    throw new Error(`Vite CLI not found at ${viteBin}`);
  }

  const child = spawn(
    process.execPath,
    [viteBin, "dev", "--host", HOST, "--port", String(port), "--strictPort"],
    {
      cwd: root,
      env: { ...process.env, ...env },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.log(`[${name.toLowerCase()}] ${text}`);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.log(`[${name.toLowerCase()}] ${text}`);
  });

  let exited = false;
  child.once("exit", (code, signal) => {
    exited = true;
    if (code !== 0) console.log(`[showcase] ${name} server exited code=${code} signal=${signal ?? ""}`);
  });

  servers.push({ name, type: "cli", process: child });
  await waitForHttpReady(`http://${HOST}:${port}/`);
  if (exited) throw new Error(`${name} server exited before readiness.`);

  report.servers[key] = {
    host: HOST,
    port,
    root,
    strategy: "Vite CLI child process",
  };
  console.log(`[showcase] ${name} server ready at http://${HOST}:${port}/`);
}

async function closeEverything() {
  if (activePage) await activePage.close().catch(() => undefined);
  if (activeContext) await activeContext.close().catch(() => undefined);
  if (browser) await browser.close().catch(() => undefined);
  for (const entry of servers.reverse()) {
    if (entry.type === "cli" && entry.process && !entry.process.killed) {
      entry.process.kill();
      await Promise.race([
        new Promise((resolve) => entry.process.once("exit", resolve)),
        sleep(2500).then(() => {
          if (!entry.process.killed) entry.process.kill("SIGKILL");
        }),
      ]).catch(() => undefined);
    }
  }
}

async function startBrowser() {
  browser = await chromium.launch({ headless: !headed });
}

async function newPage() {
  activeContext = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  activePage = await activeContext.newPage();
  activePage.setDefaultTimeout(9000);
  activePage.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      report.browserConsole.push({
        clip: activeClipKey,
        type: message.type(),
        text: message.text(),
      });
      console.log(`[browser:${message.type()}] ${message.text()}`);
    }
  });
  return activePage;
}

async function closePage() {
  if (activePage) await activePage.close().catch(() => undefined);
  if (activeContext) await activeContext.close().catch(() => undefined);
  activePage = null;
  activeContext = null;
}

async function waitForFonts(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
}

async function installRuntime(page) {
  await page.evaluate(() => {
    if (window.__SMARTT_SHOWCASE__) return;

    const style = document.createElement("style");
    style.id = "smartt-showcase-runtime-style";
    style.textContent = `
      html, body, body * { cursor: none !important; }
      #smartt-showcase-cursor {
        position: fixed;
        left: 0;
        top: 0;
        width: 20px;
        height: 28px;
        z-index: 2147483647;
        pointer-events: none;
        opacity: 0;
        transform: translate3d(-80px, -80px, 0);
        transition: opacity 220ms ease;
        will-change: transform, opacity;
      }
      #smartt-showcase-cursor svg {
        display: block;
        width: 20px;
        height: 28px;
        filter: drop-shadow(0 2px 3px rgba(0,0,0,0.28));
      }
      .smartt-showcase-ripple {
        position: fixed;
        width: 18px;
        height: 18px;
        margin-left: -9px;
        margin-top: -9px;
        z-index: 2147483646;
        pointer-events: none;
        border: 1px solid rgba(15, 23, 42, 0.42);
        border-radius: 999px;
        opacity: 0;
        animation: smartt-showcase-ripple 360ms ease-out forwards;
      }
      @keyframes smartt-showcase-ripple {
        0% { opacity: 0.42; transform: scale(0.5); }
        100% { opacity: 0; transform: scale(1.85); }
      }
    `;
    document.head.appendChild(style);

    const cursor = document.createElement("div");
    cursor.id = "smartt-showcase-cursor";
    cursor.innerHTML = `
      <svg viewBox="0 0 20 28" aria-hidden="true">
        <path d="M3.1 2.3 16.2 15.1 10.4 15.6 13.7 23.4 10.4 24.8 7.2 17.1 3.1 21.3Z" fill="white" stroke="rgba(15,23,42,.82)" stroke-width="1.35" stroke-linejoin="round"/>
      </svg>
    `;
    document.body.appendChild(cursor);

    const state = { x: -80, y: -80, visible: false };
    const easings = {
      linear: (t) => t,
      in: (t) => t * t * t,
      out: (t) => 1 - Math.pow(1 - t, 3),
      inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const setCursor = (x, y) => {
      state.x = x;
      state.y = y;
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    async function moveCursorTo(x, y, options = {}) {
      const durationMs = options.durationMs ?? 700;
      const easing = easings[options.easing ?? "inOut"] ?? easings.inOut;
      const startX = state.x;
      const startY = state.y;
      const start = performance.now();
      await new Promise((resolve) => {
        const frame = (now) => {
          const t = Math.min(1, (now - start) / durationMs);
          const eased = easing(t);
          setCursor(startX + (x - startX) * eased, startY + (y - startY) * eased);
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
    }

    async function showCursor() {
      state.visible = true;
      cursor.style.opacity = "1";
      await wait(240);
    }

    async function hideCursor() {
      state.visible = false;
      cursor.style.opacity = "0";
      await wait(240);
    }

    function rippleAt(x, y) {
      const ripple = document.createElement("div");
      ripple.className = "smartt-showcase-ripple";
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 420);
    }

    function scrollToY(y, options = {}) {
      const durationMs = options.durationMs ?? 1000;
      const easingName = options.easing ?? "inOut";
      const easing = easings[easingName] ?? easings.inOut;
      const startY = window.scrollY;
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const endY = Math.max(0, Math.min(maxY, y));
      const start = performance.now();
      return new Promise((resolve) => {
        const frame = (now) => {
          const t = Math.min(1, (now - start) / durationMs);
          const eased = easing(t);
          window.scrollTo(0, startY + (endY - startY) * eased);
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
    }

    async function scrollSequence(steps) {
      const metrics = [];
      let floorY = window.scrollY;
      for (const step of steps) {
        const y = Math.max(floorY, step.y);
        const startedAt = performance.now();
        await scrollToY(y, {
          durationMs: step.durationMs,
          easing: step.easing ?? "inOut",
        });
        const endY = window.scrollY;
        metrics.push({
          label: step.label,
          startY: floorY,
          endY,
          deltaY: endY - floorY,
          durationMs: Math.round(performance.now() - startedAt),
        });
        floorY = endY;
      }
      return metrics;
    }

    window.__SMARTT_SHOWCASE__ = {
      wait,
      cursor: {
        state,
        moveTo: moveCursorTo,
        show: showCursor,
        hide: hideCursor,
        rippleAt,
      },
      scroll: {
        toY: scrollToY,
        sequence: scrollSequence,
      },
    };
  });
}

async function runtime(page, fn, arg) {
  return page.evaluate(
    async ({ source, input }) => {
      const showcase = window.__SMARTT_SHOWCASE__;
      if (!showcase) throw new Error("SmartT showcase runtime is not installed.");
      const run = new Function("showcase", "input", `return (${source})(showcase, input);`);
      return await run(showcase, input);
    },
    { source: fn.toString(), input: arg },
  );
}

async function centerOf(locator, label) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Could not find visible box for ${label}.`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function moveCursorToLocator(page, locator, label, options = {}) {
  const center = await centerOf(locator, label);
  await runtime(
    page,
    (showcase, input) => showcase.cursor.moveTo(input.x - 2, input.y - 2, input.options),
    { ...center, options },
  );
  await page.mouse.move(center.x, center.y);
  return center;
}

async function clickLocator(page, locator, label, options = {}) {
  const center = await moveCursorToLocator(page, locator, label, options.move ?? { durationMs: 640 });
  await sleep(options.pauseMs ?? 190);
  await runtime(page, (showcase, input) => showcase.cursor.rippleAt(input.x, input.y), center);
  await locator.click({ timeout: 5000 });
  await sleep(options.afterMs ?? 260);
}

async function showCursor(page) {
  await runtime(page, (showcase) => showcase.cursor.show());
}

async function hideCursor(page) {
  await runtime(page, (showcase) => showcase.cursor.hide());
}

async function startScreencast(page, tempPath) {
  if (!page.screencast?.start || !page.screencast?.stop) {
    throw new Error("Installed Playwright does not support page.screencast.start/stop.");
  }
  await fs.rm(tempPath, { force: true });
  await page.screencast.start({
    path: tempPath,
    size: VIEWPORT,
    quality: 92,
  });
  return performance.now();
}

async function stopScreencast(page) {
  if (page?.screencast?.stop) await page.screencast.stop();
}

async function publishClip(clip) {
  const tempPath = path.join(clip.directory, clip.tempName);
  const finalPath = path.join(clip.directory, clip.fileName);
  const previousPath = path.join(clip.directory, clip.previousName);
  const stat = await fs.stat(tempPath);
  if (!stat.size) throw new Error(`Video was created but is empty: ${tempPath}`);

  await fs.rm(previousPath, { force: true });
  let movedExisting = false;
  try {
    await fs.rename(finalPath, previousPath);
    movedExisting = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  try {
    await fs.rename(tempPath, finalPath);
    if (movedExisting) await fs.rm(previousPath, { force: true });
  } catch (error) {
    if (movedExisting) await fs.rename(previousPath, finalPath).catch(() => undefined);
    throw error;
  }

  return { path: finalPath, sizeBytes: stat.size };
}

function makeClipState(clip) {
  return {
    key: clip.key,
    name: clip.name,
    output: path.join(clip.directory, clip.fileName),
    startedAt: new Date().toISOString(),
    durationMs: null,
    usefulDurationMs: null,
    sizeBytes: null,
    scenes: [],
    vehicleSelected: null,
  };
}

function videoTimeMs(startedAt) {
  return Math.round(performance.now() - startedAt);
}

function markScene(clipState, name, startedAt, extra = {}) {
  const entry = { name, atMs: videoTimeMs(startedAt), ...extra };
  clipState.scenes.push(entry);
  activeScene = name;
  console.log(`[showcase] ${clipState.name}: ${name} @ ${entry.atMs}ms`);
  return entry;
}

function shouldRecordWebsiteShot(key) {
  return !selectedWebsiteShots || selectedWebsiteShots.has(key);
}

async function waitForWebsiteReady(page) {
  await page.goto(websiteUrl, { waitUntil: "domcontentloaded" });
  await waitForFonts(page);
  await page.locator("#top").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#problem").waitFor({ state: "attached", timeout: 15000 });
  await page.locator("#solution").waitFor({ state: "attached", timeout: 15000 });
  await page.locator("#product").waitFor({ state: "attached", timeout: 15000 });
  await page.locator("#platform").waitFor({ state: "attached", timeout: 15000 });
  await page.locator(".dashboard-portal").waitFor({ state: "attached", timeout: 15000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await installRuntime(page);
  await hideCursor(page);
  await sleep(500);
}

async function preflightComposition(page, shotKey, composition, elements, options = {}) {
  activeScene = `${shotKey} geometry preflight`;
  const result = await page.evaluate(
    ({ shotKey: qaShotKey, composition: qaComposition, elements: qaElements, safeFrame, preferredScrollY }) => {
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const readBoxes = () => {
        const boxes = [];
        for (const entry of qaElements) {
          const matched = entry.all
            ? Array.from(document.querySelectorAll(entry.selector))
            : [document.querySelector(entry.selector)].filter(Boolean);
          if (!matched.length) {
            throw new Error(`Missing geometry selector for ${qaShotKey}: ${entry.selector}`);
          }
          matched.forEach((el, index) => {
            const rect = el.getBoundingClientRect();
            boxes.push({
              name: entry.all ? `${entry.name} ${index + 1}` : entry.name,
              selector: entry.selector,
              text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 90),
              documentTop: rect.top + window.scrollY,
              documentBottom: rect.bottom + window.scrollY,
              width: rect.width,
              height: rect.height,
            });
          });
        }
        return boxes;
      };

      const initialBoxes = readBoxes();
      const unionTop = Math.min(...initialBoxes.map((box) => box.documentTop));
      const unionBottom = Math.max(...initialBoxes.map((box) => box.documentBottom));
      const safeCenter = (safeFrame.top + safeFrame.bottom) / 2;
      let minScrollY = 0;
      let maxScrollY = maxY;
      for (const box of initialBoxes) {
        minScrollY = Math.max(minScrollY, box.documentBottom - safeFrame.bottom);
        maxScrollY = Math.min(maxScrollY, box.documentTop - safeFrame.top);
      }
      const fitsByMath = minScrollY <= maxScrollY;
      const centeredY = unionTop + (unionBottom - unionTop) / 2 - safeCenter;
      const lower = fitsByMath ? minScrollY : 0;
      const upper = fitsByMath ? maxScrollY : maxY;
      let desiredY = centeredY;
      if (preferredScrollY === "top") desiredY = minScrollY;
      else if (preferredScrollY === "bottom") desiredY = maxScrollY;
      else if (typeof preferredScrollY === "number") desiredY = preferredScrollY;
      const scrollY = Math.max(0, Math.min(maxY, Math.round(Math.max(lower, Math.min(upper, desiredY)))));
      window.scrollTo(0, scrollY);

      const finalBoxes = readBoxes().map((box) => ({
        ...box,
        top: Number((box.documentTop - window.scrollY).toFixed(2)),
        bottom: Number((box.documentBottom - window.scrollY).toFixed(2)),
        height: Number(box.height.toFixed(2)),
        width: Number(box.width.toFixed(2)),
      }));
      const fit = finalBoxes.every((box) => box.top >= safeFrame.top - 1 && box.bottom <= safeFrame.bottom + 1);

      return {
        shotKey: qaShotKey,
        composition: qaComposition,
        scrollY: Number(window.scrollY.toFixed(2)),
        safeViewport: safeFrame,
        fit: fit ? "PASS" : "FALLBACK",
        fitsByMath,
        bounds: finalBoxes,
      };
    },
    {
      shotKey,
      composition,
      elements,
      safeFrame: SAFE_FRAME,
      preferredScrollY: options.align ?? options.preferredScrollY ?? null,
    },
  );
  await sleep(options.settleMs ?? 850);
  geometryQa.shots.push(result);
  return result;
}

async function holdStatic(page, durationMs) {
  const samples = await page.evaluate(async (ms) => {
    const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    const start = window.scrollY;
    await wait(Math.round(ms / 2));
    const middle = window.scrollY;
    await wait(Math.round(ms / 2));
    const end = window.scrollY;
    return { start, middle, end };
  }, durationMs);
  const drift = Math.max(samples.start, samples.middle, samples.end) - Math.min(samples.start, samples.middle, samples.end);
  if (Math.abs(drift) > 1.25) {
    throw new Error(`Observation scroll drift exceeded tolerance: ${JSON.stringify(samples)}`);
  }
  return {
    start: Number(samples.start.toFixed(2)),
    middle: Number(samples.middle.toFixed(2)),
    end: Number(samples.end.toFixed(2)),
    driftPx: Number(drift.toFixed(2)),
  };
}

function paethPredictor(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function decodePng(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) throw new Error("Invalid PNG screenshot.");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }

  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG screenshot format bitDepth=${bitDepth} colorType=${colorType}.`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * channels);
  let sourceOffset = 0;
  let targetOffset = 0;
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = Buffer.from(inflated.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      else if (filter === 2) row[x] = (row[x] + up) & 255;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (row[x] + paethPredictor(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}.`);
    }

    row.copy(pixels, targetOffset);
    previous = row;
    targetOffset += stride;
  }

  return { width, height, channels, pixels };
}

function compareScreenshots(referenceBuffer, actualBuffer) {
  const reference = decodePng(referenceBuffer);
  const actual = decodePng(actualBuffer);
  if (reference.width !== actual.width || reference.height !== actual.height) {
    return {
      status: "FAIL",
      reason: "Dimension mismatch",
      diffRatio: 1,
      differingPixels: reference.width * reference.height,
      totalPixels: reference.width * reference.height,
    };
  }

  const totalPixels = reference.width * reference.height;
  let differingPixels = 0;
  let totalDelta = 0;
  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    const referenceOffset = pixel * reference.channels;
    const actualOffset = pixel * actual.channels;
    const deltaR = Math.abs(reference.pixels[referenceOffset] - actual.pixels[actualOffset]);
    const deltaG = Math.abs(reference.pixels[referenceOffset + 1] - actual.pixels[actualOffset + 1]);
    const deltaB = Math.abs(reference.pixels[referenceOffset + 2] - actual.pixels[actualOffset + 2]);
    const maxDelta = Math.max(deltaR, deltaG, deltaB);
    totalDelta += deltaR + deltaG + deltaB;
    if (maxDelta > 3) differingPixels += 1;
  }

  const diffRatio = differingPixels / totalPixels;
  return {
    status: diffRatio <= 0.0015 ? "PASS" : "FAIL",
    diffRatio: Number(diffRatio.toFixed(6)),
    differingPixels,
    totalPixels,
    meanChannelDelta: Number((totalDelta / (totalPixels * 3)).toFixed(4)),
  };
}

async function captureEndpointFrame(page, scrollY, settleMs = 220) {
  await page.evaluate((targetY) => window.scrollTo(0, targetY), scrollY);
  await sleep(settleMs);
  return page.screenshot({ fullPage: false, animations: "disabled" });
}

async function composeDesktopObservation(page, shotKey, composition) {
  let geometry = await preflightComposition(page, shotKey, composition, [
    { name: "Desktop heading", selector: ".showcase-section--desktop .showcase-heading" },
    { name: "Rendered laptop", selector: ".showcase-section--desktop .rendered-laptop" },
  ]);
  if (geometry.fit !== "PASS") {
    geometry = await preflightComposition(page, shotKey, `${composition} laptop fallback`, [
      { name: "Rendered laptop", selector: ".showcase-section--desktop .rendered-laptop" },
    ], { align: "top" });
  }
  if (geometry.fit !== "PASS") throw new Error(`${shotKey} desktop composition did not fit the safe frame.`);
  return geometry;
}

async function composeBridgeGeometries(page) {
  const problem = await composeW01ProblemObservation(page);
  if (problem.fit !== "PASS") throw new Error("B01 source W01 Problem composition did not fit.");

  const architecture = await preflightComposition(page, "W02", "Architecture all four steps", [
    { name: "Architecture identity", selector: "#solution .section-label" },
    { name: "Architecture title", selector: "#solution h2" },
    { name: "Architecture context", selector: "#solution .lead" },
    { name: "Architecture step", selector: "#solution .solution-steps__item", all: true },
  ]);
  if (architecture.fit !== "PASS") throw new Error("B01/B02 W02 Architecture composition did not fit.");

  const desktop = await composeDesktopObservation(page, "W04", "Desktop heading and complete laptop");
  const mobile = await composeW05MobileObservation(page);
  const phoneBodies = mobile.bounds.filter((box) => box.name.startsWith("Phone body"));
  const phonesFit = phoneBodies.length === 3 && phoneBodies.every((box) => box.top >= mobile.safeViewport.top - 1 && box.bottom <= VIEWPORT.height + 1);
  if (mobile.fit !== "PASS" || !phonesFit) throw new Error("B03/B04 W05 Mobile composition did not fit.");

  const openConsole = await composeDesktopObservation(page, "W06", "Open console action W04 desktop composition");

  return {
    problem,
    architecture,
    desktop,
    mobile,
    openConsole,
  };
}

async function recordBridge(page, bridge, sourceGeometry, destinationGeometry) {
  activeClipKey = bridge.key;
  activeScene = `${bridge.key} endpoint preflight`;
  const clipState = makeClipState(bridge);
  report.clips.website.bridges[bridge.key] = clipState;
  const sourceY = sourceGeometry.scrollY;
  const destinationY = destinationGeometry.scrollY;
  const startHandleMs = 220;
  const endHandleMs = 220;
  let recordingStartedAt = 0;

  const sourceReference = await captureEndpointFrame(page, sourceY, 260);
  const bridgeFirstStableFrame = await captureEndpointFrame(page, sourceY, 80);
  let bridgeLastStableFrame = null;
  let destinationReference = null;

  try {
    await page.evaluate((targetY) => window.scrollTo(0, targetY), sourceY);
    await sleep(300);
    recordingStartedAt = await startScreencast(page, path.join(bridge.directory, bridge.tempName));

    markScene(clipState, "Source handle", recordingStartedAt, { scrollY: sourceY });
    await sleep(startHandleMs);

    markScene(clipState, "Bridge travel", recordingStartedAt, {
      sourceScrollY: sourceY,
      destinationScrollY: destinationY,
      direction: bridge.direction,
    });
    const travelStartedAt = videoTimeMs(recordingStartedAt);
    const travel = await runtime(
      page,
      (showcase, input) =>
        showcase.scroll.toY(input.destinationY, {
          durationMs: input.durationMs,
          easing: "inOut",
        }),
      { destinationY, durationMs: bridge.travelDurationMs },
    );

    markScene(clipState, "Destination handle", recordingStartedAt, { scrollY: destinationY });
    await sleep(endHandleMs);

    clipState.usefulDurationMs = bridge.travelDurationMs;
    clipState.durationMs = videoTimeMs(recordingStartedAt);
    clipState.motion = {
      travelStartedAtMs: travelStartedAt,
      travel,
      sourceScrollY: sourceY,
      destinationScrollY: destinationY,
      direction: bridge.direction,
    };

    await stopScreencast(page);
    recordingStartedAt = 0;
    const published = await publishClip(bridge);
    bridgeLastStableFrame = await page.screenshot({ fullPage: false, animations: "disabled" });
    destinationReference = await captureEndpointFrame(page, destinationY, 260);
    const startMatch = compareScreenshots(sourceReference, bridgeFirstStableFrame);
    const endMatch = compareScreenshots(destinationReference, bridgeLastStableFrame);
    const endpointStatus = startMatch.status === "PASS" && endMatch.status === "PASS" ? "PASS" : "FAIL";

    clipState.sizeBytes = published.sizeBytes;
    clipState.endpointMatch = endpointStatus;
    clipState.endedAt = new Date().toISOString();

    bridgeQa.bridges.push({
      key: bridge.key,
      sourceShot: bridge.sourceShot,
      destinationShot: bridge.destinationShot,
      sourceEndpoint: bridge.sourceEndpoint,
      destinationEndpoint: bridge.destinationEndpoint,
      sourceScrollY: sourceY,
      destinationScrollY: destinationY,
      direction: bridge.direction,
      actualTravelDurationMs: bridge.travelDurationMs,
      totalDurationIncludingHandlesMs: clipState.durationMs,
      viewport: VIEWPORT,
      fps: bridgeQa.fps,
      codec: bridgeQa.codec,
      endpointMatchStatus: endpointStatus,
      endpointMatches: {
        sourceReferenceToBridgeFirstStableFrame: startMatch,
        destinationReferenceToBridgeLastStableFrame: endMatch,
      },
      output: published.path,
    });

    console.log(`[showcase] PASS ${bridge.name} ${published.path}`);
    return clipState;
  } catch (error) {
    if (recordingStartedAt) await stopScreencast(page).catch(() => undefined);
    throw error;
  }
}

async function composeW01ProblemObservation(page) {
  activeScene = "W01 problem geometry preflight";
  const result = await page.evaluate(() => {
    const header = document.querySelector("header");
    const heroVisual = document.querySelector("#top .hero-banner");
    const required = [
      { name: "Problem framing", selector: "#problem .section-head" },
      { name: "Problem cards", selector: "#problem .problem-grid" },
      { name: "Problem card", selector: "#problem .problem-grid__item", all: true },
    ];
    const fuelContext = document.querySelector("#problem .fuel-context");
    if (!header || !heroVisual) throw new Error("Missing W01 header or hero visual selector.");

    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const headerBottom = header.getBoundingClientRect().bottom;
    const readBox = (el, name, selector) => {
      const rect = el.getBoundingClientRect();
      return {
        name,
        selector,
        text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 90),
        documentTop: rect.top + window.scrollY,
        documentBottom: rect.bottom + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
    };
    const boxes = [];
    for (const entry of required) {
      const matched = entry.all
        ? Array.from(document.querySelectorAll(entry.selector))
        : [document.querySelector(entry.selector)].filter(Boolean);
      if (!matched.length) throw new Error(`Missing W01 selector: ${entry.selector}`);
      matched.forEach((el, index) => boxes.push(readBox(el, entry.all ? `${entry.name} ${index + 1}` : entry.name, entry.selector)));
    }

    const heroVisualBox = readBox(heroVisual, "Hero visual", "#top .hero-banner");
    const heroClearY = Math.ceil(heroVisualBox.documentBottom - headerBottom + 2);
    const minScrollY = Math.max(heroClearY, ...boxes.map((box) => box.documentBottom - (window.innerHeight - 45)));
    const maxScrollY = Math.min(maxY, ...boxes.map((box) => box.documentTop - (headerBottom + 20)));
    const scrollY = Math.max(0, Math.min(maxY, Math.round(Math.max(minScrollY, Math.min(maxScrollY, heroClearY)))));
    window.scrollTo(0, scrollY);

    const finalHeaderBottom = header.getBoundingClientRect().bottom;
    const finalHeroRect = heroVisual.getBoundingClientRect();
    const finalBoxes = boxes.map((box) => ({
      ...box,
      top: Number((box.documentTop - window.scrollY).toFixed(2)),
      bottom: Number((box.documentBottom - window.scrollY).toFixed(2)),
      height: Number(box.height.toFixed(2)),
      width: Number(box.width.toFixed(2)),
    }));
    const finalFuelContextRect = fuelContext?.getBoundingClientRect() ?? null;
    const heroCleared = finalHeroRect.bottom <= finalHeaderBottom + 1;
    const contentFits = finalBoxes.every((box) => box.top >= finalHeaderBottom + 20 && box.bottom <= window.innerHeight - 45);

    return {
      shotKey: "W01",
      composition: "Problem observation with cleared hero visual",
      scrollY: Number(window.scrollY.toFixed(2)),
      safeViewport: { top: Number((finalHeaderBottom + 20).toFixed(2)), bottom: window.innerHeight - 45 },
      fit: heroCleared && contentFits ? "PASS" : "FALLBACK",
      headerBottom: Number(finalHeaderBottom.toFixed(2)),
      heroVisualBottom: Number(finalHeroRect.bottom.toFixed(2)),
      heroCleared,
      fuelContextTop: finalFuelContextRect ? Number(finalFuelContextRect.top.toFixed(2)) : null,
      bounds: finalBoxes,
    };
  });
  await sleep(850);
  geometryQa.shots.push(result);
  return result;
}

async function composeW05MobileObservation(page) {
  activeScene = "W05 mobile geometry preflight";
  const result = await page.evaluate(() => {
    const header = document.querySelector("header");
    const heading = document.querySelector(".showcase-section--mobile .showcase-heading");
    const gallery = document.querySelector(".showcase-section--mobile .phone-gallery");
    const mobileSection = document.querySelector(".showcase-section--mobile");
    const contactSection = document.querySelector("#contact");
    const phones = Array.from(document.querySelectorAll(".showcase-section--mobile .rendered-phone"));
    const captions = Array.from(document.querySelectorAll(".showcase-section--mobile .phone-presentation__caption"));
    if (!header || !heading || !gallery || !mobileSection || phones.length !== 3 || captions.length !== 3) {
      throw new Error("Missing W05 mobile composition selectors.");
    }

    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const headerBottom = header.getBoundingClientRect().bottom;
    const readBox = (el, name, selector) => {
      const rect = el.getBoundingClientRect();
      return {
        name,
        selector,
        text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 90),
        documentTop: rect.top + window.scrollY,
        documentBottom: rect.bottom + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
    };
    const headingBox = readBox(heading, "Mobile heading", ".showcase-section--mobile .showcase-heading");
    const galleryBox = readBox(gallery, "Phone gallery", ".showcase-section--mobile .phone-gallery");
    const phoneBoxes = phones.map((phone, index) => readBox(phone, `Phone body ${index + 1}`, ".showcase-section--mobile .rendered-phone"));
    const captionBoxes = captions.map((caption, index) =>
      readBox(caption, `Phone caption ${index + 1}`, ".showcase-section--mobile .phone-presentation__caption"),
    );
    const nextDocTop = contactSection
      ? contactSection.getBoundingClientRect().top + window.scrollY
      : mobileSection.getBoundingClientRect().bottom + window.scrollY;
    const captionsBottom = Math.max(...captionBoxes.map((box) => box.documentBottom));

    const headingTopSafe = headerBottom + 20;
    const captionBottomSafe = window.innerHeight - 45;
    const minForCaptions = captionsBottom - captionBottomSafe;
    const maxForHeading = headingBox.documentTop - headingTopSafe;
    const maxForNoNext = nextDocTop - window.innerHeight;
    const relaxedCaptionSafe = window.innerHeight - 35;
    const fullHeadingPreferredY = Math.min(maxForHeading, maxForNoNext);
    const fullHeadingFits = minForCaptions <= fullHeadingPreferredY;
    const fullHeadingAlmostFits = captionsBottom - relaxedCaptionSafe <= fullHeadingPreferredY + 8;

    let scrollY;
    let headingMode;
    if (fullHeadingFits || fullHeadingAlmostFits) {
      scrollY = Math.max(0, Math.min(maxY, Math.round(fullHeadingPreferredY)));
      headingMode = "FULL";
    } else {
      const absentHeadingY = headingBox.documentBottom - headerBottom + 4;
      const minGalleryY = Math.max(absentHeadingY, captionsBottom - captionBottomSafe);
      const maxGalleryY = Math.min(maxY, ...phoneBoxes.map((box) => box.documentTop - (headerBottom + 20)), nextDocTop - window.innerHeight);
      scrollY = Math.max(0, Math.min(maxY, Math.round(Math.max(minGalleryY, Math.min(maxGalleryY, minGalleryY)))));
      headingMode = "INTENTIONALLY ABSENT";
    }
    window.scrollTo(0, scrollY);

    const finalHeadingRect = heading.getBoundingClientRect();
    const finalNextTop = nextDocTop - window.scrollY;
    const toFinal = (box) => ({
      ...box,
      top: Number((box.documentTop - window.scrollY).toFixed(2)),
      bottom: Number((box.documentBottom - window.scrollY).toFixed(2)),
      height: Number(box.height.toFixed(2)),
      width: Number(box.width.toFixed(2)),
    });
    const finalBoxes = [headingBox, galleryBox, ...phoneBoxes, ...captionBoxes].map(toFinal);
    const finalPhoneBoxes = finalBoxes.filter((box) => box.name.startsWith("Phone body"));
    const finalCaptionBoxes = finalBoxes.filter((box) => box.name.startsWith("Phone caption"));
    const headingFullyVisible = finalHeadingRect.top >= headerBottom + 14 && finalHeadingRect.bottom <= window.innerHeight;
    const headingAbsent = finalHeadingRect.bottom <= headerBottom + 1;
    const noPartialHeading = headingFullyVisible || headingAbsent;
    const phonesComplete = finalPhoneBoxes.every((box) => box.top >= headerBottom + 20 && box.bottom <= window.innerHeight);
    const captionsReadable = finalCaptionBoxes.every((box) => box.top >= headerBottom + 20 && box.bottom <= window.innerHeight - 30);
    const noNextBand = finalNextTop >= window.innerHeight;

    return {
      shotKey: "W05",
      composition: headingMode === "FULL" ? "Mobile heading and three phones" : "Three-phone gallery fallback",
      scrollY: Number(window.scrollY.toFixed(2)),
      safeViewport: { top: Number((headerBottom + 20).toFixed(2)), bottom: window.innerHeight - 45 },
      fit: noPartialHeading && phonesComplete && captionsReadable && noNextBand ? "PASS" : "FALLBACK",
      headingMode,
      headingFullyVisible,
      headingAbsent,
      phonesComplete,
      captionsReadable,
      nextSectionTop: Number(finalNextTop.toFixed(2)),
      noNextBand,
      bounds: finalBoxes,
    };
  });
  await sleep(850);
  geometryQa.shots.push(result);
  return result;
}

async function recordStaticWebsiteShot({ page, clip, reportKey, holdMs, beforeMs = 600, afterMs = 650, markName }) {
  activeClipKey = reportKey;
  const clipState = makeClipState(clip);
  report.clips.website.shots[reportKey] = clipState;
  let recordingStartedAt = 0;

  try {
    recordingStartedAt = await startScreencast(page, path.join(clip.directory, clip.tempName));
    await sleep(beforeMs);
    markScene(clipState, markName, recordingStartedAt);
    clipState.observationScroll = await holdStatic(page, holdMs);
    await sleep(afterMs);
    clipState.usefulDurationMs = holdMs;
    clipState.durationMs = videoTimeMs(recordingStartedAt);
    await stopScreencast(page);
    const published = await publishClip(clip);
    clipState.sizeBytes = published.sizeBytes;
    clipState.endedAt = new Date().toISOString();
    console.log(`[showcase] PASS ${clip.name} ${published.path}`);
    return clipState;
  } catch (error) {
    if (recordingStartedAt) await stopScreencast(page).catch(() => undefined);
    throw error;
  }
}

async function recordW01(page) {
  const heroGeometry = await preflightComposition(page, "W01", "Hero", [
    { name: "Hero headline", selector: "#top h1" },
    { name: "Hero lead", selector: "#top .lead" },
    { name: "Hero visual", selector: "#top .hero-banner" },
  ]);
  const problemGeometry = await composeW01ProblemObservation(page);
  if (heroGeometry.fit !== "PASS" || problemGeometry.fit !== "PASS") {
    throw new Error("W01 required Hero/Problem composition did not fit the safe frame.");
  }

  await page.evaluate((scrollY) => window.scrollTo(0, scrollY), heroGeometry.scrollY);
  await sleep(650);

  activeClipKey = "W01";
  const clip = websiteShots.W01;
  const clipState = makeClipState(clip);
  report.clips.website.shots.W01 = clipState;
  let recordingStartedAt = 0;

  try {
    recordingStartedAt = await startScreencast(page, path.join(clip.directory, clip.tempName));
    await sleep(600);

    markScene(clipState, "Hero observation", recordingStartedAt);
    const heroHoldMs = 4200;
    const heroScroll = await holdStatic(page, heroHoldMs);

    markScene(clipState, "Hero to Problem travel", recordingStartedAt);
    const travelStartedAt = videoTimeMs(recordingStartedAt);
    const travel = await runtime(
      page,
      (showcase, input) =>
        showcase.scroll.sequence([
          { label: "hero-problem", y: input.problemY, durationMs: input.durationMs, easing: "inOut" },
        ]),
      { problemY: problemGeometry.scrollY, durationMs: 1550 },
    );

    markScene(clipState, "Problem observation", recordingStartedAt);
    const problemHoldMs = 4200;
    const problemScroll = await holdStatic(page, problemHoldMs);
    await sleep(650);

    clipState.usefulDurationMs = heroHoldMs + 1550 + problemHoldMs;
    clipState.durationMs = videoTimeMs(recordingStartedAt);
    clipState.motion = {
      heroScroll,
      travelStartedAtMs: travelStartedAt,
      travel,
      problemScroll,
    };
    await stopScreencast(page);
    const published = await publishClip(clip);
    clipState.sizeBytes = published.sizeBytes;
    clipState.endedAt = new Date().toISOString();
    console.log(`[showcase] PASS ${clip.name} ${published.path}`);
  } catch (error) {
    if (recordingStartedAt) await stopScreencast(page).catch(() => undefined);
    throw error;
  }
}

async function recordW02(page) {
  const allGeometry = await preflightComposition(page, "W02", "Architecture all four steps", [
    { name: "Architecture identity", selector: "#solution .section-label" },
    { name: "Architecture title", selector: "#solution h2" },
    { name: "Architecture context", selector: "#solution .lead" },
    { name: "Architecture step", selector: "#solution .solution-steps__item", all: true },
  ]);

  if (allGeometry.fit === "PASS") {
    await recordStaticWebsiteShot({
      page,
      clip: websiteShots.W02,
      reportKey: "W02",
      holdMs: 8900,
      markName: "Architecture observation",
    });
    return;
  }

  const firstHalf = await preflightComposition(page, "W02A", "Architecture steps 01-02", [
    { name: "Architecture identity", selector: "#solution .section-label" },
    { name: "Architecture title", selector: "#solution h2" },
    { name: "Step 01", selector: "#solution .solution-steps__item:nth-child(1)" },
    { name: "Step 02", selector: "#solution .solution-steps__item:nth-child(2)" },
  ]);
  if (firstHalf.fit !== "PASS") throw new Error("W02A architecture fallback did not fit.");
  await recordStaticWebsiteShot({
    page,
    clip: websiteShots.W02A,
    reportKey: "W02A",
    holdMs: 5200,
    markName: "Architecture 01-02 observation",
  });

  const secondHalf = await preflightComposition(page, "W02B", "Architecture steps 03-04", [
    { name: "Architecture identity", selector: "#solution .section-label" },
    { name: "Architecture title", selector: "#solution h2" },
    { name: "Step 03", selector: "#solution .solution-steps__item:nth-child(3)" },
    { name: "Step 04", selector: "#solution .solution-steps__item:nth-child(4)" },
  ]);
  if (secondHalf.fit !== "PASS") throw new Error("W02B architecture fallback did not fit.");
  await recordStaticWebsiteShot({
    page,
    clip: websiteShots.W02B,
    reportKey: "W02B",
    holdMs: 5200,
    markName: "Architecture 03-04 observation",
  });
  report.clips.website.architectureFallback = "W02A/W02B";
}

async function recordW03(page) {
  activeClipKey = "W03";
  activeScene = "W03 product bridge preflight";
  const geometry = await page.evaluate(({ safeFrame }) => {
    const product = document.querySelector("#product");
    const platformDesktop = document.querySelector(".showcase-section--desktop");
    const canvas = document.querySelector("#product canvas");
    if (!product || !platformDesktop) throw new Error("Missing W03 product/platform selectors.");
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const productRect = product.getBoundingClientRect();
    const desktopRect = platformDesktop.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect() ?? null;
    const startY = Math.max(0, Math.min(maxY, Math.round(productRect.top + window.scrollY + 360 - safeFrame.top)));
    const endY = Math.max(startY, Math.min(maxY, Math.round(desktopRect.top + window.scrollY - 140)));
    window.scrollTo(0, startY);
    return {
      shotKey: "W03",
      composition: "Product bridge travel",
      scrollY: window.scrollY,
      safeViewport: safeFrame,
      fit: canvas ? "PASS" : "FALLBACK",
      bounds: [
        {
          name: "Product section",
          selector: "#product",
          top: Number((productRect.top + window.scrollY - startY).toFixed(2)),
          bottom: Number((productRect.bottom + window.scrollY - startY).toFixed(2)),
          height: Number(productRect.height.toFixed(2)),
        },
        canvasRect
          ? {
              name: "Product canvas",
              selector: "#product canvas",
              top: Number((canvasRect.top + window.scrollY - startY).toFixed(2)),
              bottom: Number((canvasRect.bottom + window.scrollY - startY).toFixed(2)),
              height: Number(canvasRect.height.toFixed(2)),
            }
          : {
              name: "Product canvas",
              selector: "#product canvas",
              top: null,
              bottom: null,
              height: null,
            },
      ],
      travel: { startY, endY, deltaY: endY - startY },
    };
  }, { safeFrame: SAFE_FRAME });
  geometryQa.shots.push(geometry);

  if (geometry.fit !== "PASS" || geometry.travel.deltaY < 120) {
    report.clips.website.shots.W03 = {
      key: "W03",
      name: websiteShots.W03.name,
      output: path.join(websiteShots.W03.directory, websiteShots.W03.fileName),
      status: "OMITTED",
      reason: "Product bridge omitted due to visual quality or insufficient travel geometry.",
    };
    console.log("[showcase] OMIT W03 Product bridge");
    return;
  }

  await sleep(650);
  activeClipKey = "W03";
  const clip = websiteShots.W03;
  const clipState = makeClipState(clip);
  report.clips.website.shots.W03 = clipState;
  let recordingStartedAt = 0;

  try {
    recordingStartedAt = await startScreencast(page, path.join(clip.directory, clip.tempName));
    markScene(clipState, "Product bridge travel", recordingStartedAt);
    const travel = await runtime(
      page,
      (showcase, input) =>
        showcase.scroll.sequence([
          { label: "product-bridge", y: input.endY, durationMs: 1150, easing: "inOut" },
        ]),
      { endY: geometry.travel.endY },
    );
    await sleep(280);
    clipState.durationMs = videoTimeMs(recordingStartedAt);
    clipState.usefulDurationMs = 1150;
    clipState.motion = { travel };
    await stopScreencast(page);
    const published = await publishClip(clip);
    clipState.sizeBytes = published.sizeBytes;
    clipState.endedAt = new Date().toISOString();
    console.log(`[showcase] PASS ${clip.name} ${published.path}`);
  } catch (error) {
    if (recordingStartedAt) await stopScreencast(page).catch(() => undefined);
    throw error;
  }
}

async function recordW04(page) {
  let geometry = await preflightComposition(page, "W04", "Desktop heading and complete laptop", [
    { name: "Desktop heading", selector: ".showcase-section--desktop .showcase-heading" },
    { name: "Rendered laptop", selector: ".showcase-section--desktop .rendered-laptop" },
  ]);

  if (geometry.fit !== "PASS") {
    geometry = await preflightComposition(page, "W04", "Complete laptop fallback", [
      { name: "Rendered laptop", selector: ".showcase-section--desktop .rendered-laptop" },
    ], { align: "top" });
    report.clips.website.desktopFallback = "Complete laptop prioritized; upper Platform/Desktop copy excluded.";
  }
  if (geometry.fit !== "PASS") throw new Error("W04 complete laptop did not fit the safe frame.");

  await recordStaticWebsiteShot({
    page,
    clip: websiteShots.W04,
    reportKey: "W04",
    holdMs: 5400,
    markName: "Platform desktop observation",
  });
}

async function recordW05(page) {
  const geometry = await composeW05MobileObservation(page);

  const phoneBodies = geometry.bounds.filter((box) => box.name.startsWith("Phone body"));
  const phonesFit = phoneBodies.length === 3 && phoneBodies.every((box) => box.top >= geometry.safeViewport.top - 1 && box.bottom <= VIEWPORT.height + 1);
  if (geometry.fit !== "PASS" || !phonesFit) {
    throw new Error("W05 mobile composition did not satisfy heading, phones, captions, and next-section constraints.");
  }
  if (geometry.headingMode === "INTENTIONALLY ABSENT") {
    report.clips.website.mobileFallback = "Phone gallery composed as sole subject; mobile heading intentionally excluded.";
  }

  await recordStaticWebsiteShot({
    page,
    clip: websiteShots.W05,
    reportKey: "W05",
    holdMs: 5400,
    markName: "Platform mobile observation",
  });
}

async function recordW06(page) {
  let geometry = await preflightComposition(page, "W06", "Open console action W04 desktop composition", [
    { name: "Desktop heading", selector: ".showcase-section--desktop .showcase-heading" },
    { name: "Rendered laptop", selector: ".showcase-section--desktop .rendered-laptop" },
  ]);
  if (geometry.fit !== "PASS") {
    geometry = await preflightComposition(page, "W06", "Open console action W04 laptop fallback", [
      { name: "Rendered laptop", selector: ".showcase-section--desktop .rendered-laptop" },
    ], { align: "top" });
    report.clips.website.openConsoleComposition = "Matched W04 laptop-priority desktop composition.";
  }
  if (geometry.fit !== "PASS") throw new Error("W06 desktop action composition did not fit.");

  await page.evaluate((localDashboardUrl) => {
    const portal = document.querySelector(".dashboard-portal");
    if (portal instanceof HTMLAnchorElement) {
      portal.href = localDashboardUrl;
      portal.target = "_self";
    }
  }, dashboardUrl);

  activeClipKey = "W06";
  const clip = websiteShots.W06;
  const clipState = makeClipState(clip);
  report.clips.website.shots.W06 = clipState;
  let recordingStartedAt = 0;

  try {
    const portal = page.locator(".showcase-section--desktop .dashboard-portal").first();
    const cta = page.locator(".showcase-section--desktop .dashboard-portal__copy").first();
    const ctaCenter = await centerOf(cta, "Open SmartT Console CTA");
    const portalBox = await portal.boundingBox();
    if (!portalBox) throw new Error("Could not find visible box for W06 dashboard portal.");
    const cursorStart = {
      x: Math.max(16, portalBox.x - 120),
      y: Math.max(16, ctaCenter.y - 150),
    };
    await runtime(
      page,
      (showcase, input) => showcase.cursor.moveTo(input.x, input.y, { durationMs: 1, easing: "linear" }),
      cursorStart,
    );
    await page.mouse.move(cursorStart.x, cursorStart.y);
    await hideCursor(page);

    recordingStartedAt = await startScreencast(page, path.join(clip.directory, clip.tempName));
    markScene(clipState, "Stable laptop before cursor", recordingStartedAt);
    const stableScroll = await holdStatic(page, 600);
    await showCursor(page);

    markScene(clipState, "Cursor to Open SmartT Console", recordingStartedAt);
    const center = await moveCursorToLocator(page, cta, "Open SmartT Console", {
      durationMs: 880,
      easing: "inOut",
    });
    await sleep(560);
    const ctaVisible = await page.evaluate(() => {
      const copy = document.querySelector(".showcase-section--desktop .dashboard-portal__copy");
      if (!copy) return false;
      const rect = copy.getBoundingClientRect();
      const style = getComputedStyle(copy);
      const pointer = window.__SMARTT_SHOWCASE__?.cursor?.state;
      const cursorOverCta = pointer
        ? pointer.x >= rect.left - 4 && pointer.x <= rect.right + 4 && pointer.y >= rect.top - 4 && pointer.y <= rect.bottom + 4
        : false;
      return Number(style.opacity) > 0.85 && rect.width > 0 && rect.height > 0 && cursorOverCta;
    });
    if (!ctaVisible) throw new Error("W06 CTA reveal did not become visible before click.");

    markScene(clipState, "Open console click", recordingStartedAt);
    await sleep(210);
    await runtime(page, (showcase, input) => showcase.cursor.rippleAt(input.x, input.y), center);
    await page.mouse.click(center.x, center.y);
    await sleep(680);

    clipState.observationScroll = stableScroll;
    clipState.ctaReveal = "PASS";
    clipState.click = "PASS";
    clipState.usefulDurationMs = 3170;
    clipState.durationMs = videoTimeMs(recordingStartedAt);
    await stopScreencast(page);
    const published = await publishClip(clip);
    clipState.sizeBytes = published.sizeBytes;
    clipState.endedAt = new Date().toISOString();
    console.log(`[showcase] PASS ${clip.name} ${published.path}`);
  } catch (error) {
    if (recordingStartedAt) await stopScreencast(page).catch(() => undefined);
    throw error;
  }
}

async function recordWebsiteCoverage() {
  activeClipKey = "website";
  report.clips.website = {
    key: "website",
    name: "Website shot-based coverage",
    strategy: "shot-based coverage",
    outputDir: websiteOutputDir,
    geometryQa: geometryQaPath,
    startedAt: new Date().toISOString(),
    shots: {},
  };

  const page = await newPage();
  let ok = false;
  try {
    activeScene = "website readiness";
    await waitForWebsiteReady(page);
    await sleep(2600);
    if (shouldRecordWebsiteShot("W01")) await recordW01(page);
    if (shouldRecordWebsiteShot("W02")) await recordW02(page);
    if (shouldRecordWebsiteShot("W03")) await recordW03(page);
    if (shouldRecordWebsiteShot("W04")) await recordW04(page);
    if (shouldRecordWebsiteShot("W05")) await recordW05(page);
    if (shouldRecordWebsiteShot("W06")) await recordW06(page);
    await writeGeometryQa();
    report.clips.website.endedAt = new Date().toISOString();
    ok = true;
  } finally {
    if (ok) await closePage();
  }
}

async function recordWebsiteBridges() {
  activeClipKey = "bridges";
  report.clips.website = {
    key: "website-bridges",
    name: "Website scroll bridges",
    strategy: "real webpage scroll bridges",
    outputDir: websiteOutputDir,
    bridgeQa: bridgeQaPath,
    startedAt: new Date().toISOString(),
    bridges: {},
  };

  const page = await newPage();
  let ok = false;
  try {
    activeScene = "website bridge readiness";
    await waitForWebsiteReady(page);
    await sleep(2600);
    const geometries = await composeBridgeGeometries(page);

    await recordBridge(page, websiteBridges.B01, geometries.problem, geometries.architecture);
    await recordBridge(page, websiteBridges.B02, geometries.architecture, geometries.desktop);
    await recordBridge(page, websiteBridges.B03, geometries.desktop, geometries.mobile);
    await recordBridge(page, websiteBridges.B04, geometries.mobile, geometries.openConsole);

    await writeBridgeQa();
    report.clips.website.endedAt = new Date().toISOString();
    ok = true;
  } finally {
    if (ok) await closePage();
  }
}

async function waitForDashboardOverview(page) {
  await page.goto(dashboardUrl, { waitUntil: "domcontentloaded" });
  await waitForFonts(page);
  await page.waitForURL((url) => url.origin === new URL(dashboardUrl).origin && url.pathname === "/", { timeout: 15000 });
  await page.getByRole("heading", { name: "Fuel & Fleet Overview" }).waitFor({ timeout: 15000 });
  await page.getByText("Fleet fuel efficiency").first().waitFor({ timeout: 15000 });
  await installRuntime(page);
  await hideCursor(page);
  await sleep(600);
}

async function waitForRouteReady(page, pathName, heading) {
  await page.waitForURL((url) => url.origin === new URL(dashboardUrl).origin && url.pathname === pathName, { timeout: 7000 });
  await page.getByRole("heading", { name: heading }).waitFor({ timeout: 9000 });
  await waitForFonts(page);
}

async function waitUntil(startedAt, targetMs) {
  const remaining = targetMs - (performance.now() - startedAt);
  if (remaining > 0) await sleep(remaining);
}

async function recordDashboardTour() {
  activeClipKey = "dashboard";
  const clipState = makeClipState(dashboardClip);
  report.clips.dashboard = clipState;
  const page = await newPage();
  let recordingStartedAt = 0;
  let ok = false;

  try {
    activeScene = "dashboard readiness";
    await waitForDashboardOverview(page);
    recordingStartedAt = await startScreencast(page, path.join(dashboardClip.directory, dashboardClip.tempName));

    markScene(clipState, "Overview", recordingStartedAt);
    await waitUntil(recordingStartedAt, 4100);
    await showCursor(page);

    markScene(clipState, "Live Map", recordingStartedAt);
    await clickLocator(page, page.locator('aside a[href="/live-map"]').first(), "Live Map nav", {
      move: { durationMs: 700, easing: "inOut" },
      pauseMs: 190,
      afterMs: 280,
    });
    await waitForRouteReady(page, "/live-map", "Live Map");
    await page.locator("text=Vehicles in view").waitFor({ timeout: 7000 });
    await hideCursor(page);
    await waitUntil(recordingStartedAt, 9700);
    await showCursor(page);
    await waitUntil(recordingStartedAt, 10500);

    markScene(clipState, "Vehicle Detail", recordingStartedAt);
    const vehicleButton = page.locator("button").filter({ hasText: /\d{2}[A-Z]{1,2}-\d{3}\.\d{2}/ }).first();
    await clickLocator(page, vehicleButton, "vehicle in view", {
      move: { durationMs: 760, easing: "inOut" },
      pauseMs: 180,
      afterMs: 300,
    });
    const detailButton = page.getByRole("link", { name: "Open vehicle detail" });
    await detailButton.waitFor({ timeout: 7000 });
    const selectedPlate = await page.locator("text=/\\d{2}[A-Z]{1,2}-\\d{3}\\.\\d{2}/").last().textContent();
    clipState.vehicleSelected = selectedPlate?.match(/\d{2}[A-Z]{1,2}-\d{3}\.\d{2}/)?.[0] ?? null;
    await clickLocator(page, detailButton, "Open vehicle detail", {
      move: { durationMs: 620, easing: "inOut" },
      pauseMs: 190,
      afterMs: 300,
    });
    await page.waitForURL(/\/vehicles\/V-\d+/, { timeout: 7000 });
    const detailTitle = await page.locator("h1").first().textContent();
    clipState.vehicleSelected = detailTitle?.trim() || clipState.vehicleSelected;
    await waitForFonts(page);
    await hideCursor(page);
    await waitUntil(recordingStartedAt, 17800);

    markScene(clipState, "Fuel Analytics", recordingStartedAt);
    await showCursor(page);
    await clickLocator(page, page.locator('aside a[href="/fuel"]').first(), "Fuel Analytics nav", {
      move: { durationMs: 760, easing: "inOut" },
      pauseMs: 190,
      afterMs: 300,
    });
    await waitForRouteReady(page, "/fuel", "Fuel Analytics");
    await hideCursor(page);
    await waitUntil(recordingStartedAt, 24200);

    markScene(clipState, "Overview Return", recordingStartedAt);
    await showCursor(page);
    await clickLocator(page, page.locator('aside a[href="/"]').first(), "Overview nav", {
      move: { durationMs: 720, easing: "inOut" },
      pauseMs: 180,
      afterMs: 300,
    });
    await waitForRouteReady(page, "/", "Fuel & Fleet Overview");
    await hideCursor(page);
    await waitUntil(recordingStartedAt, 29200);

    clipState.durationMs = videoTimeMs(recordingStartedAt);
    await stopScreencast(page);
    const published = await publishClip(dashboardClip);
    clipState.sizeBytes = published.sizeBytes;
    clipState.endedAt = new Date().toISOString();
    ok = true;
    console.log(`[showcase] PASS Dashboard Tour ${published.path}`);
  } catch (error) {
    if (recordingStartedAt) await stopScreencast(page).catch(() => undefined);
    throw error;
  } finally {
    if (ok) await closePage();
  }
}

async function captureFailure(error) {
  console.error(`[showcase] FAIL clip="${activeClipKey}" scene="${activeScene}": ${error.stack || error.message}`);
  try {
    if (activePage) {
      await fs.mkdir(outputDir, { recursive: true });
      await activePage.screenshot({ path: failureScreenshotPath, fullPage: false });
    }
    if (geometryQa.shots.length) await writeGeometryQa();
  } catch (screenshotError) {
    console.error(`[showcase] Could not write failure screenshot/report: ${screenshotError.message}`);
  }
  await writeReport({
    status: "FAIL",
    failedClip: activeClipKey,
    failedScene: activeScene,
    currentUrl: activePage?.url() ?? null,
    error: error.message,
  }).catch((reportError) => console.error(`[showcase] Could not write failure report: ${reportError.message}`));
}

async function main() {
  if (!VALID_COMMANDS.has(command)) {
    throw new Error(`Usage: node record-showcase.mjs website|dashboard|all|bridges [--headed]`);
  }

  await ensureOutputDirs();
  const needsWebsite = command === "website" || command === "all" || command === "bridges";
  const needsDashboard = command === "dashboard" || command === "website" || command === "all" || command === "bridges";

  if (needsDashboard) {
    await startViteCliServer({ key: "dashboard", name: "Dashboard", root: dashboardRoot, port: DASHBOARD_PORT });
  }
  if (needsWebsite) {
    await startViteCliServer({
      key: "website",
      name: "Website",
      root: websiteRoot,
      port: WEBSITE_PORT,
      env: { VITE_SMARTT_DASHBOARD_URL: dashboardUrl },
    });
  }

  await startBrowser();

  if (command === "website" || command === "all") await recordWebsiteCoverage();
  if (command === "bridges") await recordWebsiteBridges();
  if (command === "dashboard" || command === "all") await recordDashboardTour();

  await writeReport({ status: "PASS" });
  console.log("[showcase] PASS");
  if (command === "bridges") {
    for (const key of ["B01", "B02", "B03", "B04"]) {
      const bridge = websiteBridges[key];
      console.log(`[showcase] ${bridge.name}: ${path.join(bridge.directory, bridge.fileName)}`);
    }
    console.log(`[showcase] Bridge QA: ${bridgeQaPath}`);
  } else if (needsWebsite) {
    for (const key of ["W01", "W02", "W03", "W04", "W05", "W06"]) {
      if (!shouldRecordWebsiteShot(key)) continue;
      const shot = websiteShots[key];
      console.log(`[showcase] ${shot.name}: ${path.join(shot.directory, shot.fileName)}`);
    }
    console.log(`[showcase] Geometry QA: ${geometryQaPath}`);
  }
  if (command === "dashboard" || command === "all") {
    console.log(`[showcase] Dashboard Tour: ${path.join(outputDir, dashboardClip.fileName)}`);
  }
}

main()
  .catch(async (error) => {
    await captureFailure(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeEverything();
  });
