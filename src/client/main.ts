import "./style.css";
import alumiEyeUrl from "./alumieye.png?inline";
import { CITY_H, CITY_W, GATES, GROUND } from "../core/city";
import { createGame, forwardSpeed, standings, step } from "../core/sim";
import { DT, type GameEvent, type GameState, Surface, TICK_RATE } from "../core/types";
import { Sound } from "./audio";
import { currentLanguage, recall, remember, setLanguage, t } from "./i18n";
import { clearPresses, padPause, readInput, setupTouch, wasPressed } from "./input";
import { Renderer } from "./render";
import { iconUrl, RACER_COLORS } from "./textures";
import { buttons, closeMenu, menuOpen, moveFocus, onButtonPress, panel, toast } from "./ui";

// The ALumiEye logo sits in the top-left corner on every screen.
const brandMark = document.createElement("img");
brandMark.id = "brand";
brandMark.src = alumiEyeUrl;
brandMark.alt = "ALumiEye";
document.body.append(brandMark);
const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.href = iconUrl();
document.head.append(favicon);
document.documentElement.lang = currentLanguage();

const hud = document.getElementById("hud")!;
const boostBar = document.getElementById("boost")!;
const countBox = document.getElementById("count")!;
const minimap = document.getElementById("minimap") as HTMLCanvasElement;
const renderer = new Renderer();
const sound = new Sound();
onButtonPress(() => {
  sound.wake();
  sound.click();
});
const touchMode = setupTouch(document.body);
if (touchMode) document.body.classList.add("touch");

const settings = {
  difficulty: Number(recall("difficulty") ?? 1) % 3,
  traffic: Number(recall("traffic") ?? 1) % 3,
  rivals: recall("rivals") === "5" ? 5 : 3,
};
const TRAFFIC_DENSITY = [0.6, 1, 1.45];

type Mode = "attract" | "race";
let mode: Mode = "attract";
let state: GameState = newAttract();
let focus = 0;
let paused = false;
let accumulator = 0;
let lastFrame = performance.now();
let resultsShown = false;

function newAttract() {
  return createGame({ seed: (Math.random() * 1e9) | 0, bots: 4, difficulty: 2, humans: 0, traffic: 1 });
}

function startRace() {
  closeMenu();
  sound.wake();
  mode = "race";
  paused = false;
  resultsShown = false;
  state = createGame({
    seed: (Math.random() * 1e9) | 0,
    bots: settings.rivals,
    difficulty: settings.difficulty,
    humans: 1,
    traffic: TRAFFIC_DENSITY[settings.traffic],
    playerName: t().you,
  });
  focus = 0;
  renderer.setRace(state);
  accumulator = 0;
  clearPresses();
  document.body.classList.add("racing");
  hud.hidden = false;
  boostBar.hidden = false;
  minimap.hidden = false;
  sound.startRace();
}

function toMenu() {
  mode = "attract";
  paused = false;
  state = newAttract();
  renderer.setRace(state);
  document.body.classList.remove("racing");
  hud.hidden = true;
  boostBar.hidden = true;
  minimap.hidden = true;
  countBox.hidden = true;
  sound.stopRace();
  showMainMenu();
}

function showMainMenu() {
  const s = t();
  const record = Number(recall("best") ?? 0);
  panel(
    `<h1>Eye<span>Rush</span></h1>`,
    `<p class="sub">${s.subtitle}</p>`,
    buttons([
      [s.race, startRace, "primary"],
      [`${s.difficulty}: ${s.difficulties[settings.difficulty]}`, () => {
        settings.difficulty = (settings.difficulty + 1) % 3;
        remember("difficulty", String(settings.difficulty));
        showMainMenu();
      }],
      [`${s.traffic}: ${s.traffics[settings.traffic]}`, () => {
        settings.traffic = (settings.traffic + 1) % 3;
        remember("traffic", String(settings.traffic));
        showMainMenu();
      }],
      [`${s.rivals}: ${settings.rivals}`, () => {
        settings.rivals = settings.rivals === 3 ? 5 : 3;
        remember("rivals", String(settings.rivals));
        showMainMenu();
      }],
      [s.howTo, showHowTo],
      [`${s.sound}: ${sound.enabled ? s.on : s.off}`, () => {
        sound.setEnabled(!sound.enabled);
        showMainMenu();
      }],
      [s.language, () => {
        setLanguage(currentLanguage() === "vi" ? "en" : "vi");
        showMainMenu();
      }],
    ]),
    `<p class="foot">${record ? `${s.best}: ${formatTime(record)} · ` : ""}ALumiEye</p>`,
  );
}

function showHowTo() {
  const s = t();
  panel(
    `<h2>${s.howTo}</h2>`,
    `<ul>${s.howToText.map((line) => `<li>${line}</li>`).join("")}${touchMode ? `<li>${s.touchHint}</li>` : ""}</ul>`,
    buttons([[s.back, () => (mode === "race" ? showPause() : showMainMenu())]]),
  );
}

function showPause() {
  const s = t();
  paused = true;
  panel(
    `<h2>${s.paused}</h2>`,
    buttons([
      [s.resume, resume, "primary"],
      [s.restart, startRace],
      [s.howTo, showHowTo],
      [`${s.sound}: ${sound.enabled ? s.on : s.off}`, () => {
        sound.setEnabled(!sound.enabled);
        showPause();
      }],
      [s.menu, toMenu],
    ]),
  );
}

function resume() {
  closeMenu();
  paused = false;
  lastFrame = performance.now();
  clearPresses();
}

export function formatTime(ticks: number) {
  const total = ticks / TICK_RATE;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

function showResults() {
  const s = t();
  const order = standings(state);
  const me = state.racers[0];
  const raceTime = me.finishTick >= 0 ? me.finishTick - state.startTick : 0;
  const record = Number(recall("best") ?? 0);
  const newRecord = raceTime > 0 && (record === 0 || raceTime < record);
  if (newRecord) remember("best", String(raceTime));
  const rows = order
    .map((id, place) => {
      const r = state.racers[id];
      const time = r.finishTick >= 0 ? formatTime(r.finishTick - state.startTick) : s.dnf;
      const color = RACER_COLORS[r.look % RACER_COLORS.length];
      return `<tr class="${id === 0 ? "me" : ""}"><td>${place + 1}</td><td><span class="dot" style="background:${color}"></span>${escapeHtml(r.name)}</td><td>${time}</td><td>${r.bestLap ? formatTime(r.bestLap) : "–"}</td></tr>`;
    })
    .join("");
  panel(
    `<h2>${s.results}</h2>`,
    newRecord ? `<p class="record">${s.newRecord}</p>` : "",
    `<table class="results"><tr><th>#</th><th></th><th>${s.time}</th><th>${s.bestLap}</th></tr>${rows}</table>`,
    `<div class="stats"><span>${s.nearMisses}: <b>${me.nearMisses}</b></span><span>${s.crashes}: <b>${me.crashes}</b></span></div>`,
    buttons([
      [s.restart, startRace, "primary"],
      [s.menu, toMenu],
    ]),
  );
  document.querySelector("#ui .panel")?.classList.add("wide");
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function showCount(value: number) {
  countBox.hidden = false;
  countBox.textContent = value > 0 ? String(value) : t().go;
  // Restart the pop animation.
  countBox.style.animation = "none";
  void countBox.offsetWidth;
  countBox.style.animation = "";
  if (value === 0) setTimeout(() => (countBox.hidden = true), 800);
}

function playEvents(events: GameEvent[]) {
  const me = state.racers[focus];
  for (const event of events) {
    const mine = mode === "race" && "racer" in event && event.racer === focus;
    const other = "racer" in event ? state.racers[event.racer] : null;
    const distance = other && me ? Math.hypot(other.x - me.x, other.y - me.y) : 0;
    const near = Math.max(0.12, 1 - distance / 70);
    const pan = other && me ? Math.max(-1, Math.min(1, (other.x - me.x) / 40)) : 0;
    if (mode !== "race") continue;
    switch (event.type) {
      case "count":
        sound.count(event.value);
        showCount(event.value);
        break;
      case "honk":
        if (mine) sound.horn(440, 0.16, 0, 2);
        else sound.horn(360 + event.racer * 37, 0.1 * near, pan);
        break;
      case "crash":
        sound.crash(mine ? 1 : near * 0.6, pan);
        break;
      case "splash":
        if (mine || near > 0.5) sound.splash();
        break;
      case "bump":
        if (mine) sound.bump(event.strength);
        break;
      case "nearMiss":
        if (mine) sound.nearMiss(event.combo);
        break;
      case "boost":
        if (mine) sound.boost();
        break;
      case "gate":
        if (mine) sound.gate();
        break;
      case "lap":
        if (mine) {
          sound.lap();
          toast(event.lap === state.laps - 1 ? t().lastLap : `${t().lapDone} ${event.lap}: ${formatTime(event.time)}`);
        }
        break;
      case "finish":
        if (mine) {
          sound.finish(event.place);
          toast(`${t().finished}: #${event.place}`);
        }
        break;
    }
  }
}

// The minimap: the city painted once, with racers and the next gate on top.
const MAP_SCALE = 2;
minimap.width = CITY_W / MAP_SCALE;
minimap.height = CITY_H / MAP_SCALE;
const mapPaint = minimap.getContext("2d")!;
const mapBase = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = minimap.width;
  canvas.height = minimap.height;
  const g = canvas.getContext("2d")!;
  const image = g.createImageData(canvas.width, canvas.height);
  const colors: Record<number, [number, number, number]> = {
    [Surface.Building]: [61, 33, 65],
    [Surface.Road]: [239, 227, 204],
    [Surface.Sidewalk]: [140, 105, 135],
    [Surface.Alley]: [200, 175, 160],
    [Surface.Grass]: [96, 140, 74],
    [Surface.Water]: [80, 140, 190],
    [Surface.Market]: [170, 130, 110],
    [Surface.Path]: [170, 160, 120],
    [Surface.Stall]: [110, 70, 90],
  };
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const surface = GROUND[y * MAP_SCALE * CITY_W + x * MAP_SCALE];
      const [r, gr, b] = colors[surface] ?? [0, 0, 0];
      const i = (y * canvas.width + x) * 4;
      image.data.set([r, gr, b, 255], i);
    }
  }
  g.putImageData(image, 0, 0);
  return canvas;
})();

function drawMinimap() {
  const g = mapPaint;
  g.drawImage(mapBase, 0, 0);
  const me = state.racers[focus];
  GATES.forEach((gate, i) => {
    const next = me && i === me.gate && me.finishTick < 0;
    g.fillStyle = next ? "#EBA96B" : "rgba(242, 179, 174, 0.7)";
    g.beginPath();
    g.arc(gate.x / MAP_SCALE, gate.y / MAP_SCALE, next ? 4 + Math.sin(performance.now() / 150) : 2.5, 0, Math.PI * 2);
    g.fill();
  });
  for (let i = state.racers.length - 1; i >= 0; i -= 1) {
    const r = state.racers[i];
    g.fillStyle = RACER_COLORS[r.look % RACER_COLORS.length];
    g.strokeStyle = "#2b1a2e";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(r.x / MAP_SCALE, r.y / MAP_SCALE, i === focus ? 4 : 3, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}

function updateHud() {
  const s = t();
  const me = state.racers[focus];
  if (!me) return;
  const order = standings(state);
  const place = order.indexOf(focus) + 1;
  const lap = Math.min(state.laps, me.lap + 1);
  const raceTicks = state.phase === "countdown" ? 0 : (me.finishTick >= 0 ? me.finishTick : state.tick) - state.startTick;
  const kmh = Math.round(Math.max(0, forwardSpeed(me)) * 3.6);
  hud.innerHTML =
    `<div class="chip place"><small>${s.place}</small><b>${place}</b>/${state.racers.length}</div>` +
    `<div class="chip"><small>${s.lap}</small><b>${lap}</b>/${state.laps}</div>` +
    `<div class="chip"><small>${s.time}</small><b>${formatTime(raceTicks)}</b></div>` +
    `<div class="chip speed"><small>km/h</small><b>${kmh}</b></div>`;
  const fill = me.boostTicks > 0 ? 1 : me.boost;
  (boostBar.firstElementChild as HTMLElement).style.width = `${Math.round(fill * 100)}%`;
  boostBar.classList.toggle("ready", me.boostTicks === 0 && me.boost >= 0.3);
  boostBar.classList.toggle("on", me.boostTicks > 0);
  boostBar.lastElementChild!.textContent = me.boostTicks > 0 ? `${s.boost}!` : me.boost >= 0.3 ? `${s.boost} · ${touchMode ? "⚡" : "SPACE"}` : s.boost;
}

function frame(now: number) {
  const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  if (mode === "race") {
    if ((wasPressed("Escape", "KeyP") || padPause()) && state.phase !== "done") {
      if (paused) resume();
      else showPause();
    }
  } else if (!menuOpen()) showMainMenu();

  if (menuOpen()) {
    if (wasPressed("ArrowDown", "KeyS")) moveFocus(1);
    if (wasPressed("ArrowUp", "KeyW")) moveFocus(-1);
  }

  if (!paused) {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= DT && steps < 6) {
      const input = mode === "race" ? readInput() : undefined;
      step(state, [input]);
      playEvents(state.events);
      renderer.handle(state.events, state, focus);
      accumulator -= DT;
      steps += 1;
    }
    if (steps === 6) accumulator = 0;
  }

  if (mode === "attract") {
    // The camera follows whoever leads, and a finished race starts over.
    focus = standings(state)[0] ?? 0;
    if (state.phase === "done") {
      state = newAttract();
      renderer.setRace(state);
    }
  }

  renderer.draw(state, paused ? 1 : accumulator / DT, focus, paused ? 0 : elapsed);

  if (mode === "race") {
    const me = state.racers[focus];
    sound.update(forwardSpeed(me), me.throttle, me.boostTicks > 0, me.crashed > 0);
    updateHud();
    drawMinimap();
    if (state.phase === "done" && !resultsShown) {
      resultsShown = true;
      setTimeout(() => {
        if (mode === "race") showResults();
      }, 1200);
    }
  }
  requestAnimationFrame(frame);
}

void renderer.init(document.getElementById("stage")!).then(() => {
  renderer.setRace(state);
  showMainMenu();
  requestAnimationFrame(frame);
});

// For automated checks.
(window as unknown as { eyerush: unknown }).eyerush = {
  get state() {
    return state;
  },
  get mode() {
    return mode;
  },
  startRace,
};
