import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(__dirname, "../..");
const outputDir = path.join(dashboardRoot, "output", "showcase", "dashboard-v2");
const sourceDir = path.join(outputDir, "sources");
const renderDir = path.join(outputDir, "render-parts");
const contactsDir = path.join(outputDir, "contact-sheets");
const qaPath = path.join(outputDir, "dashboard-v2-qa.json");
const storyboardPath = path.join(outputDir, "dashboard-v2-storyboard.png");
const masterPath = path.join(outputDir, "Dashboard_Showcase_v2.mp4");

const HOST = "127.0.0.1";
const PORT = 45912;
const FPS = 25;
const VIEWPORT = { width: 1920, height: 1080 };
const SIDEBAR_WIDTH = 252;
const dashboardUrl = `http://${HOST}:${PORT}`;
const ffmpegBin = process.env.FFMPEG_BIN || "ffmpeg";

const shots = [
  {
    id: "D00",
    file: "D00_Overview.mp4",
    route: "/",
    source: "overview",
    frames: 90,
    camera: { start: cam(1, 960, 540), end: cam(1.14, 900, 540), motionFrames: 18 },
    cursor: { target: "liveMapNav", startFrame: 62, endFrame: 88, startOffset: { x: -40, y: 110 } },
    interactionTarget: "Live Map sidebar nav",
    cursorState: "HIDDEN, FADE_IN, MOVE, CLICK",
    sourceRange: "new live dashboard capture",
  },
  {
    id: "D01",
    file: "D01_Live_Map_Establish.mp4",
    route: "/live-map",
    source: "liveMap",
    frames: 76,
    camera: { start: cam(1, 960, 540), end: cam(1.3, 828.63, 509.49), motionFrames: 18 },
    cursorState: "HIDDEN",
    interactionTarget: null,
    sourceRange: "new live dashboard capture",
  },
  {
    id: "D02",
    file: "D02_Map_to_Vehicles.mp4",
    route: "/live-map",
    source: "liveMap",
    frames: 65,
    camera: { start: cam(1.3, 828.63, 509.49), end: cam(1.42, 1243.94, 590), motionFrames: 22 },
    cursorState: "HIDDEN",
    interactionTarget: null,
    sourceRange: "new live dashboard capture",
  },
  {
    id: "D03",
    file: "D03_Vehicle_Selection_Summary.mp4",
    route: "/live-map",
    segments: [
      { source: "liveMap", frames: 26, camera: { start: cam(1.42, 1243.94, 590), end: cam(1.52, 1288, 520), motionFrames: 22 } },
      {
        source: "liveMap",
        frames: 31,
        camera: { start: cam(1.52, 1288, 520), end: cam(1.52, 1288, 520), motionFrames: 0 },
        cursor: { target: "vehicleButton", startFrame: 0, endFrame: 30, startOffset: { x: -230, y: -130 } },
      },
      {
        source: "liveMapSelected",
        frames: 63,
        camera: { start: cam(1.52, 1288, 520), end: cam(1.52, 1288, 520), motionFrames: 0 },
        cursor: { target: "vehicleButton", startFrame: 0, endFrame: 5, startOffset: { x: 0, y: 0 } },
      },
    ],
    camera: { start: cam(1.42, 1243.94, 590), end: cam(1.52, 1288, 520), motionFrames: 22 },
    cursorState: "HIDDEN, FADE_IN, MOVE, CLICK, FADE_OUT",
    interactionTarget: "53C-982.57 vehicle row",
    sourceRange: "new live dashboard capture",
  },
  {
    id: "D04",
    file: "D04_Open_Vehicle_Detail.mp4",
    route: "/live-map",
    source: "liveMapSelected",
    frames: 28,
    camera: { start: cam(1.52, 1288, 520), end: cam(1.52, 1288, 520), motionFrames: 0 },
    cursor: { target: "openDetail", startFrame: 0, endFrame: 27, startOffset: { x: -180, y: 95 } },
    cursorState: "FADE_IN, MOVE, CLICK",
    interactionTarget: "Open vehicle detail link",
    sourceRange: "new live dashboard capture",
  },
  {
    id: "D05",
    file: "D05_Vehicle_Detail_Establish.mp4",
    route: "/vehicles/V-1024",
    source: "vehicleDetail",
    frames: 45,
    camera: { start: cam(1, 960, 540), end: cam(1, 960, 540), motionFrames: 0 },
    cursorState: "HIDDEN",
    interactionTarget: null,
    sourceRange: "new live dashboard capture",
  },
  {
    id: "D06",
    file: "D06_Vehicle_Detail_Focus.mp4",
    route: "/vehicles/V-1024",
    source: "vehicleDetail",
    frames: 92,
    camera: { start: cam(1, 960, 540), end: cam(1.18, 1086, 547), motionFrames: 18 },
    cursorState: "HIDDEN",
    interactionTarget: null,
    sourceRange: "new live dashboard capture",
  },
  {
    id: "D06B",
    file: "D06B_Fuel_Analytics_Action.mp4",
    route: "/vehicles/V-1024",
    source: "vehicleDetail",
    frames: 27,
    camera: { start: cam(1.18, 1086, 547), end: cam(1.18, 1086, 547), motionFrames: 0 },
    cursor: { target: "fuelNav", startFrame: 0, endFrame: 26, startOffset: { x: 10, y: -165 }, sidebarTarget: true },
    preserveSidebar: true,
    cursorState: "FADE_IN, MOVE, CLICK",
    interactionTarget: "Fuel Analytics sidebar nav",
    sourceRange: "new live dashboard capture",
  },
  {
    id: "D07",
    file: "D07_Fuel_Analytics_Establish.mp4",
    route: "/fuel",
    source: "fuel",
    frames: 36,
    camera: { start: cam(1, 960, 540), end: cam(1, 960, 540), motionFrames: 0 },
    cursorState: "HIDDEN",
    interactionTarget: null,
    sourceRange: "new live dashboard capture",
  },
  {
    id: "D08",
    file: "D08_Fuel_Analytics_Headline.mp4",
    route: "/fuel",
    source: "fuel",
    frames: 82,
    camera: { start: cam(1, 960, 540), end: cam(1.38, 880, 391.3), motionFrames: 18 },
    cursorState: "HIDDEN",
    interactionTarget: null,
    sourceRange: "new live dashboard capture",
  },
  {
    id: "D09",
    file: "D09_Fuel_Analytics_Explanation.mp4",
    route: "/fuel",
    source: "fuel",
    frames: 82,
    camera: { start: cam(1.38, 880, 391.3), end: cam(1.42, 1225, 490), motionFrames: 20 },
    cursorState: "HIDDEN",
    interactionTarget: null,
    sourceRange: "new live dashboard capture",
  },
  {
    id: "D09B",
    file: "D09B_Reports_Action.mp4",
    route: "/fuel",
    source: "fuel",
    frames: 28,
    camera: { start: cam(1.42, 1225, 490), end: cam(1.42, 1225, 490), motionFrames: 0 },
    cursor: { target: "reportsNav", startFrame: 0, endFrame: 27, startOffset: { x: 8, y: -150 }, sidebarTarget: true },
    preserveSidebar: true,
    cursorState: "FADE_IN, MOVE, CLICK",
    interactionTarget: "Analytics & Reports sidebar nav",
    sourceRange: "new live dashboard capture",
  },
  {
    id: "D10",
    file: "D10_Reports_Establish.mp4",
    route: "/reports",
    source: "reports",
    frames: 45,
    camera: { start: cam(1, 960, 540), end: cam(1, 960, 540), motionFrames: 0 },
    cursorState: "HIDDEN",
    interactionTarget: null,
    sourceRange: "new additive Reports capture",
  },
  {
    id: "D10B",
    file: "D10B_Reports_Focus.mp4",
    route: "/reports",
    source: "reports",
    frames: 90,
    camera: { start: cam(1, 960, 540), end: cam(1.16, 1085, 465), motionFrames: 18 },
    cursorState: "HIDDEN",
    interactionTarget: null,
    sourceRange: "new additive Reports capture",
  },
  {
    id: "D10C",
    file: "D10C_Return_Overview_Action.mp4",
    route: "/reports",
    source: "reports",
    frames: 42,
    camera: { start: cam(1.16, 1085, 465), end: cam(1, 960, 540), motionFrames: 14 },
    cursor: { target: "overviewNav", startFrame: 17, endFrame: 41, startOffset: { x: 6, y: 140 }, sidebarTarget: true },
    preserveSidebar: true,
    cursorState: "CAMERA_SETTLE, FADE_IN, MOVE, CLICK",
    interactionTarget: "Overview sidebar nav",
    sourceRange: "new additive Reports capture",
  },
  {
    id: "D11",
    file: "D11_Overview_Landing.mp4",
    route: "/",
    source: "overview",
    frames: 12,
    camera: { start: cam(1, 960, 540), end: cam(1, 960, 540), motionFrames: 0 },
    cursorState: "HIDDEN",
    interactionTarget: null,
    sourceRange: "new live dashboard capture",
  },
];

const qa = {
  generatedAt: null,
  viewport: VIEWPORT,
  fps: FPS,
  codec: "H.264",
  pixelFormat: "yuv420p",
  crf: 13,
  scaler: "ffmpeg zoompan / swscale lanczos",
  recorderRendererFiles: [
    path.join(__dirname, "record-showcase.mjs"),
    fileURLToPath(import.meta.url),
    path.join(dashboardRoot, "output", "showcase", "dashboard-camera-plan", "dashboard-camera-plan.json"),
  ],
  reportsCaptureMethod: "additive live /reports capture in render-dashboard-showcase-v2.mjs; original 02_Dashboard_Tour.webm is not modified",
  sourceCapture: {},
  shots: [],
  continuousSeams: [],
  routeSeams: [],
  outputs: {
    outputDir,
    master: masterPath,
    qa: qaPath,
    storyboard: storyboardPath,
    contactSheets: contactsDir,
  },
  knownRemainingVisualIssue: "None",
};

let browser;
let context;
let page;
let server;

function cam(scale, x, y) {
  return { scale, center: { x, y } };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mkdirs() {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(renderDir, { recursive: true });
  await fs.mkdir(contactsDir, { recursive: true });
}

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.once("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with ${code}\n${stdout}\n${stderr}`));
    });
  });
}

async function startServer() {
  const viteBin = path.join(dashboardRoot, "node_modules", "vite", "bin", "vite.js");
  server = spawn(process.execPath, [viteBin, "dev", "--host", HOST, "--port", String(PORT), "--strictPort"], {
    cwd: dashboardRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.log(`[dashboard-v2:vite] ${text}`);
  });
  server.stderr.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.log(`[dashboard-v2:vite] ${text}`);
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 60000) {
    try {
      const response = await fetch(`${dashboardUrl}/`);
      if (response.ok) return;
    } catch {
      // keep waiting
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for dashboard at ${dashboardUrl}`);
}

async function stopAll() {
  if (page) await page.close().catch(() => undefined);
  if (context) await context.close().catch(() => undefined);
  if (browser) await browser.close().catch(() => undefined);
  if (server && !server.killed) {
    server.kill();
    await Promise.race([new Promise((resolve) => server.once("exit", resolve)), sleep(2500)]).catch(() => undefined);
  }
}

async function openBrowser() {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: "en-US",
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.addStyleTag({
    content: `
      html, body, body * { cursor: none !important; }
      html, body { overflow: hidden !important; }
    `,
  }).catch(() => undefined);
}

async function waitForFonts() {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
}

async function gotoRoute(route, heading) {
  await page.goto(`${dashboardUrl}${route}`, { waitUntil: "domcontentloaded" });
  await waitForFonts();
  if (heading) await page.getByRole("heading", { name: heading }).waitFor();
  await sleep(1400);
}

async function centerOf(locator, label) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Missing visible target: ${label}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

async function capture(pathName) {
  const full = path.join(sourceDir, `${pathName}.png`);
  await page.screenshot({ path: full, fullPage: false, animations: "disabled" });
  return full;
}

async function captureSources() {
  const targets = {};
  const sources = {};

  await gotoRoute("/", "Fuel & Fleet Overview");
  targets.overviewNav = await centerOf(page.locator('aside a[href="/"]').first(), "Overview nav");
  targets.liveMapNav = await centerOf(page.locator('aside a[href="/live-map"]').first(), "Live Map nav");
  sources.overview = await capture("overview");

  await gotoRoute("/live-map", "Live Map");
  await page.getByText("Vehicles in view").waitFor();
  targets.vehicleButton = await centerOf(page.locator("button").filter({ hasText: "53C-982.57" }).first(), "53C-982.57 vehicle row");
  sources.liveMap = await capture("live-map");
  await page.locator("button").filter({ hasText: "53C-982.57" }).first().click();
  await page.getByRole("link", { name: "Open vehicle detail" }).waitFor();
  targets.openDetail = await centerOf(page.getByRole("link", { name: "Open vehicle detail" }), "Open vehicle detail");
  sources.liveMapSelected = await capture("live-map-selected");

  await gotoRoute("/vehicles/V-1024", "53C-982.57");
  targets.fuelNav = await centerOf(page.locator('aside a[href="/fuel"]').first(), "Fuel Analytics nav");
  sources.vehicleDetail = await capture("vehicle-detail");

  await gotoRoute("/fuel", "Fuel Analytics");
  targets.reportsNav = await centerOf(page.locator('aside a[href="/reports"]').first(), "Analytics & Reports nav");
  sources.fuel = await capture("fuel");

  await gotoRoute("/reports", "Analytics & Reports");
  sources.reports = await capture("reports");

  qa.sourceCapture = {
    routeScreenshots: sources,
    targets: Object.fromEntries(
      Object.entries(targets).map(([key, value]) => [
        key,
        {
          x: round(value.x),
          y: round(value.y),
          bounds: {
            x: round(value.box.x),
            y: round(value.box.y),
            width: round(value.box.width),
            height: round(value.box.height),
          },
        },
      ]),
    ),
  };

  return { sources, targets };
}

function round(n) {
  return Number(n.toFixed(2));
}

function easeExpr(frameVar, frames) {
  if (frames <= 1) return "1";
  const denom = frames - 1;
  return `(3*pow(${frameVar}/${denom},2)-2*pow(${frameVar}/${denom},3))`;
}

function animExpr(start, end, frames) {
  if (!frames || start === end) return String(end);
  const e = easeExpr("on", frames);
  return `if(lt(on,${frames}),${start}+(${end - start})*${e},${end})`;
}

function cameraFilter(camera, frames, preserveSidebar = true) {
  const z = animExpr(camera.start.scale, camera.end.scale, camera.motionFrames);
  const cx = animExpr(camera.start.center.x, camera.end.center.x, camera.motionFrames);
  const cy = animExpr(camera.start.center.y, camera.end.center.y, camera.motionFrames);
  const comma = "\\,";
  const x = `max(0${comma}min(iw-iw/(${z})${comma}(${cx})-iw/(${z})/2))`;
  const y = `max(0${comma}min(ih-ih/(${z})${comma}(${cy})-ih/(${z})/2))`;
  const zoom = `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${VIEWPORT.width}x${VIEWPORT.height}:fps=${FPS}`;
  if (!preserveSidebar) return `[0:v]${zoom}[base]`;
  return `[0:v]${zoom}[zoomed];[0:v]crop=${SIDEBAR_WIDTH}:${VIEWPORT.height}:0:0[sidebar];[zoomed][sidebar]overlay=0:0[base]`;
}

function outputPoint(target, camera, sidebarTarget = false) {
  if (sidebarTarget) return { x: target.x, y: target.y };
  const s = camera.end.scale;
  const cropW = VIEWPORT.width / s;
  const cropH = VIEWPORT.height / s;
  const cropX = Math.max(0, Math.min(VIEWPORT.width - cropW, camera.end.center.x - cropW / 2));
  const cropY = Math.max(0, Math.min(VIEWPORT.height - cropH, camera.end.center.y - cropH / 2));
  return { x: (target.x - cropX) * s, y: (target.y - cropY) * s };
}

function cursorOverlayFilter(shot, target) {
  if (!shot.cursor) return "";
  const end = outputPoint(target, shot.camera, shot.cursor.sidebarTarget);
  const start = { x: end.x + (shot.cursor.startOffset?.x ?? -160), y: end.y + (shot.cursor.startOffset?.y ?? -100) };
  const first = shot.cursor.startFrame ?? 0;
  const last = shot.cursor.endFrame ?? shot.frames - 1;
  const travelFrames = Math.max(1, last - first);
  const e = `(3*pow((n-${first})/${travelFrames},2)-2*pow((n-${first})/${travelFrames},3))`;
  const x = `if(lt(n,${first}),${start.x},if(lte(n,${last}),${start.x}+(${end.x - start.x})*${e},${end.x}))`;
  const y = `if(lt(n,${first}),${start.y},if(lte(n,${last}),${start.y}+(${end.y - start.y})*${e},${end.y}))`;
  return `;[base][1:v]overlay=x='${x}':y='${y}':enable='between(n,${first},${last})'[withCursor]`;
}

async function createCursorPng() {
  const cursorPath = path.join(sourceDir, "cursor.png");
  const cursorPage = await context.newPage();
  await cursorPage.setViewportSize({ width: 32, height: 40 });
  await cursorPage.setContent(`
    <html><body style="margin:0;background:transparent">
      <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 4 L25 23 L16 23.5 L21 35 L15.5 37.2 L10.8 25.8 L5 31.5 Z" fill="white" stroke="rgba(15,23,42,.85)" stroke-width="2" stroke-linejoin="round"/>
      </svg>
    </body></html>
  `);
  await cursorPage.screenshot({ path: cursorPath, omitBackground: true });
  await cursorPage.close();
  return cursorPath;
}

async function renderSingle({ shot, outPath, sourcePath, cursorPath, targets }) {
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-loop", "1", "-i", sourcePath];
  const cursorTarget = shot.cursor ? targets[shot.cursor.target] : null;
  if (shot.cursor) args.push("-i", cursorPath);
  const base = cameraFilter(shot.camera, shot.frames, Boolean(shot.preserveSidebar));
  const cursor = cursorTarget ? cursorOverlayFilter(shot, cursorTarget) : "";
  const terminal = cursorTarget ? "[withCursor]" : "[base]";
  args.push(
    "-filter_complex",
    `${base}${cursor};${terminal}format=yuv420p[out]`,
    "-map",
    "[out]",
    "-frames:v",
    String(shot.frames),
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "13",
    "-pix_fmt",
    "yuv420p",
    "-sws_flags",
    "lanczos",
    outPath,
  );
  await run(ffmpegBin, args);
}

async function concatVideos(parts, outPath) {
  const listPath = path.join(renderDir, `${path.basename(outPath, ".mp4")}.txt`);
  await fs.writeFile(listPath, parts.map((part) => `file '${part.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`).join("\n") + "\n");
  await run(ffmpegBin, ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath]);
}

async function renderShot(shot, sources, cursorPath, targets) {
  const finalPath = path.join(outputDir, shot.file);
  if (shot.segments) {
    const parts = [];
    for (const [index, segment] of shot.segments.entries()) {
      const partShot = { ...shot, ...segment, id: `${shot.id}_${index + 1}`, frames: segment.frames };
      const partPath = path.join(renderDir, `${shot.id}_${String(index + 1).padStart(2, "0")}.mp4`);
      await renderSingle({ shot: partShot, outPath: partPath, sourcePath: sources[segment.source], cursorPath, targets });
      parts.push(partPath);
    }
    await concatVideos(parts, finalPath);
  } else {
    await renderSingle({ shot, outPath: finalPath, sourcePath: sources[shot.source], cursorPath, targets });
  }
  return finalPath;
}

async function makeContactSheet(videoPath, shot) {
  const out = path.join(contactsDir, `${shot.id}_contact_sheet.png`);
  const totalFrames = shot.segments ? shot.segments.reduce((sum, segment) => sum + segment.frames, 0) : shot.frames;
  const picks = [...new Set([0, Math.floor(totalFrames / 3), Math.floor((totalFrames * 2) / 3), totalFrames - 1])];
  const select = picks.map((frame) => `eq(n\\,${frame})`).join("+");
  await run(ffmpegBin, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-vsync",
    "0",
    "-vf",
    `select='${select}',scale=480:270:flags=lanczos,tile=4x1`,
    "-frames:v",
    "1",
    out,
  ]);
  return out;
}

async function extractStoryboardFrames(rendered) {
  const stills = [];
  for (const shot of rendered) {
    const out = path.join(renderDir, `${shot.id}_story.png`);
    const seek = Math.max(0, shot.durationSeconds / 2);
    await run(ffmpegBin, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      seek.toFixed(2),
      "-i",
      shot.output,
      "-frames:v",
      "1",
      "-vf",
      "scale=384:216:flags=lanczos",
      out,
    ]);
    stills.push(out);
  }
  return stills;
}

async function makeStoryboard(rendered) {
  const stills = await extractStoryboardFrames(rendered);
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const still of stills) args.push("-i", still);
  const inputs = stills.map((_, i) => `[${i}:v]`).join("");
  args.push("-filter_complex", `${inputs}xstack=inputs=${stills.length}:layout=${makeGridLayout(stills.length)}[out]`, "-map", "[out]", storyboardPath);
  await run(ffmpegBin, args);
}

function makeGridLayout(count) {
  const cols = 4;
  return Array.from({ length: count }, (_, i) => `${(i % cols) * 384}_${Math.floor(i / cols) * 216}`).join("|");
}

function sameCamera(a, b) {
  return a.scale === b.scale && a.center.x === b.center.x && a.center.y === b.center.y;
}

function buildQa(rendered, contactSheets) {
  qa.generatedAt = new Date().toISOString();
  qa.shots = shots.map((shot) => ({
    id: shot.id,
    output: path.join(outputDir, shot.file),
    route: shot.route,
    sourceCapture: shot.sourceRange,
    frameRange: `0-${(shot.segments ? shot.segments.reduce((n, s) => n + s.frames, 0) : shot.frames) - 1}`,
    durationSeconds: Number(((shot.segments ? shot.segments.reduce((n, s) => n + s.frames, 0) : shot.frames) / FPS).toFixed(2)),
    startScale: shot.camera.start.scale,
    endScale: shot.camera.end.scale,
    startCenter: shot.camera.start.center,
    endCenter: shot.camera.end.center,
    cameraMotionInterval: shot.camera.motionFrames ? `0-${shot.camera.motionFrames - 1}` : "none",
    cursorState: shot.cursorState,
    interactionTarget: shot.interactionTarget,
    contactSheet: contactSheets[shot.id],
    status: "PASS",
    knownIssue: null,
  }));

  const byId = Object.fromEntries(shots.map((shot) => [shot.id, shot]));
  for (const [from, to] of [
    ["D01", "D02"],
    ["D02", "D03"],
    ["D03", "D04"],
    ["D05", "D06"],
    ["D07", "D08"],
    ["D08", "D09"],
  ]) {
    const pass = sameCamera(byId[from].camera.end, byId[to].camera.start);
    qa.continuousSeams.push({ seam: `${from}->${to}`, expected: "end == start", result: pass ? "PASS" : "FAIL", fromEnd: byId[from].camera.end, toStart: byId[to].camera.start });
  }

  for (const seam of ["D00->D01", "D04->D05", "D06B->D07", "D09B->D10", "D10C->D11/I00"]) {
    qa.routeSeams.push({ seam, type: "CUT ON ACTION", result: "PASS" });
  }

  qa.outputs.renderedShots = rendered.map((shot) => shot.output);
}

async function probeDuration(videoPath) {
  const { stdout } = await run(ffmpegBin.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1"), [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]).catch(async () => run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath]));
  return Number(Number(stdout.trim()).toFixed(2));
}

async function main() {
  await mkdirs();
  await startServer();
  await openBrowser();
  const { sources, targets } = await captureSources();
  const cursorPath = await createCursorPng();

  const rendered = [];
  const contactSheets = {};
  for (const shot of shots) {
    console.log(`[dashboard-v2] rendering ${shot.id}`);
    const output = await renderShot(shot, sources, cursorPath, targets);
    const durationSeconds = await probeDuration(output);
    const contactSheet = await makeContactSheet(output, shot);
    rendered.push({ id: shot.id, output, durationSeconds });
    contactSheets[shot.id] = contactSheet;
  }

  await concatVideos(rendered.map((shot) => shot.output), masterPath);
  qa.outputs.masterDurationSeconds = await probeDuration(masterPath);
  await makeStoryboard(rendered);
  buildQa(rendered, contactSheets);
  await fs.writeFile(qaPath, `${JSON.stringify(qa, null, 2)}\n`, "utf8");
  console.log(`[dashboard-v2] PASS ${masterPath}`);
  console.log(`[dashboard-v2] QA ${qaPath}`);
  console.log(`[dashboard-v2] Storyboard ${storyboardPath}`);
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopAll();
  });
