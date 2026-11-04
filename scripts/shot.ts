/**
 * Opens the built game in headless Chrome, starts a race, drives for a few seconds and saves
 * screenshots. Usage: pnpm build && pnpm shot [outdir]
 */
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";

const out = process.argv[2] ?? "shots";
mkdirSync(out, { recursive: true });
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer((req, res) => {
  const path = join("dist", decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/\/$/, "/index.html"));
  try {
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = (server.address() as { port: number }).port;

const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/menu.png` });
await page.click("button.primary");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/countdown.png` });
await page.waitForTimeout(2000);
await page.keyboard.down("ArrowUp");
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/racing.png` });
await page.keyboard.down("KeyH");
await page.waitForTimeout(200);
await page.keyboard.up("KeyH");
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(1300);
await page.keyboard.up("ArrowRight");
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/turn.png` });
const info = await page.evaluate(() => {
  const g = (window as any).eyerush;
  const me = g.state.racers[0];
  return { mode: g.mode, phase: g.state.phase, tick: g.state.tick, x: me.x.toFixed(1), y: me.y.toFixed(1), gate: me.gate, crashes: me.crashes, near: me.nearMisses };
});
console.log(JSON.stringify(info));
await page.keyboard.up("ArrowUp");
// Verify the commuter UI, pause semantics and both result screens in the real app.
const commute = await page.evaluate(() => (window as any).eyerush.state.commute);
if (!commute || await page.locator("#hud").innerText().then((text) => !text.includes("CƠ QUAN"))) throw new Error("Missing commute HUD");
await page.keyboard.press("Escape");
const pausedTick = await page.evaluate(() => (window as any).eyerush.state.tick);
await page.waitForTimeout(250);
if (await page.evaluate(() => (window as any).eyerush.state.tick) !== pausedTick) throw new Error("Pause did not freeze clock");
await page.keyboard.press("Escape");
if (!await page.locator("#quick-help").isVisible()) throw new Error("Missing visible quick controls");
if (!await page.locator("#quick-help").innerText().then((text) => text.includes("Phanh / lùi"))) throw new Error("Missing brake/reverse guidance");
// Place a moving rider in the opposing lane; the live simulation must enforce the stop.
await page.evaluate(() => {
  const state = (window as any).eyerush.state;
  state.npcs = [];
  state.commute.stoppedTicks = 0;
  const r = state.racers[0];
  Object.assign(r, { x: 56, px: 56, y: 13, py: 13, heading: 0, ph: 0, vx: 5, vy: 0, crashed: 0 });
});
await page.waitForFunction(() => (window as any).eyerush.state.commute.stoppedTicks > 0);
if (!await page.locator("#detention").innerText().then((text) => text.includes("NGƯỢC CHIỀU"))) throw new Error("Missing wrong-way detention");
await page.screenshot({ path: `${out}/wrong-way.png` });
await page.waitForFunction(() => (window as any).eyerush.state.commute.stoppedTicks === 0, null, { timeout: 8000 });
const restored = await page.evaluate(() => {
  const r = (window as any).eyerush.state.racers[0];
  return r.y > 17 && Math.abs(r.heading) < 0.01;
});
if (!restored) throw new Error("Wrong-way rider not restored to legal lane");
await page.screenshot({ path: `${out}/correct-lane.png` });
await page.evaluate(() => {
  const state = (window as any).eyerush.state;
  state.tick = state.startTick + state.commute.deadlineTicks;
});
await page.waitForTimeout(1500);
if (!await page.locator("#ui").innerText().then((text) => text.includes("TRỄ CHẤM CÔNG"))) throw new Error("Missing late result");
await page.screenshot({ path: `${out}/late.png` });
await page.click("button.primary");
await page.waitForTimeout(3300);
await page.evaluate(() => {
  const state = (window as any).eyerush.state;
  state.npcs = [];
  state.commute.checkpoint = 4;
  const rider = state.racers[0];
  rider.x = rider.px = 96; rider.y = rider.py = 112;
  rider.vx = rider.vy = 0;
});
await page.waitForTimeout(1500);
if (!await page.locator("#ui").innerText().then((text) => text.includes("KỊP GIỜ RỒI"))) throw new Error("Missing on-time result");
await page.screenshot({ path: `${out}/on-time.png` });
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
mobile.on("pageerror", (e) => errors.push(String(e)));
await mobile.goto(`http://localhost:${port}/`);
await mobile.waitForTimeout(1500);
await mobile.screenshot({ path: `${out}/mobile-menu.png` });
await mobile.click("button.primary");
await mobile.waitForTimeout(3500);
await mobile.screenshot({ path: `${out}/mobile-commute.png` });
console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no page errors; commuter HUD, pause, late/on-time results and mobile verified");
await browser.close();
server.close();
if (errors.length) process.exitCode = 1;
