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
console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no page errors");
await browser.close();
server.close();
