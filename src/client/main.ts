import "./style.css";
import alumiEyeUrl from "./alumieye.png?inline";
import { CITY_H, CITY_W, GATES, GROUND } from "../core/city";
import { COMMUTE_STOPS, commuteElapsed, commuteRemaining, HOME, OFFICE, POLICE_POSTS } from "../core/commute";
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
const detention = document.createElement("div");
detention.id = "detention";
detention.setAttribute("role", "status");
detention.hidden = true;
document.body.append(detention);
const quickHelp = document.createElement("aside");
quickHelp.id = "quick-help";
quickHelp.hidden = true;
document.body.append(quickHelp);
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
    mode: "commute",
    bots: 0,
    difficulty: settings.difficulty,
    humans: 1,
    traffic: TRAFFIC_DENSITY[settings.traffic],
    playerName: t().you,
  });
  focus = 0;
  quickHelp.hidden = false;
  quickHelp.innerHTML = `<strong>${t().howTo}</strong><div>${touchMode ? t().touchQuick : t().keyboardQuick}</div><small>${t().roadRules}</small>`;
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
  detention.hidden = true;
  quickHelp.hidden = true;
  sound.stopRace();
  showMainMenu();
}

function showMainMenu() {
  const s = t();
  const record = Number(recall("commuteBest") ?? 0);
  panel(
    `<h1>Eye<span>Rush</span></h1>`,
    `<p class="sub">${s.subtitle}</p>`,
    `<p class="morning-story">${s.story}</p>`,
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
    `<p class="foot">${record ? `${s.best}: ${formatTime(record)} · ` : ""}ALumiEye · <span id="game-version">${__GAME_VERSION__}</span></p>`,
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
  if (state.commute) {
    const trip = state.commute;
    const me = state.racers[0];
    const elapsed = commuteElapsed(state);
    const won = trip.outcome === "onTime";
    const record = Number(recall("commuteBest") ?? 0);
    const best = won && (record === 0 || elapsed < record);
    if (best) remember("commuteBest", String(elapsed));
    panel(
      `<p class="sub">${s.morning}</p>`,
      `<h2>${won ? s.onTime : s.late}</h2>`,
      `<p>${won ? s.onTimeText : s.lateText}</p>`,
      best ? `<p class="record">${s.newRecord}</p>` : "",
      `<div class="stats"><span>${s.time}: <b>${formatTime(elapsed)}</b></span><span>${s.penalty}: <b>${formatTime(trip.penaltyTicks)}</b></span><span>${s.violations}: <b>${trip.violations}</b></span><span>${s.potholeHits}: <b>${trip.potholeHits}</b></span><span>${s.crashes}: <b>${me.crashes}</b></span></div>`,
      buttons([[s.restart, startRace, "primary"], [s.menu, toMenu]]),
    );
    return;
  }
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
          toast(state.commute ? t().onTime : `${t().finished}: #${event.place}`);
        }
        break;
    }
  }
}

// Render at twice the logical resolution so roads and labels stay crisp on phones.
const MAP_PAD = 16;
const MAP_TOP = 32;
const MAP_WIDTH = CITY_W + MAP_PAD * 2;
const MAP_HEIGHT = CITY_H + MAP_TOP + 42;
minimap.width = MAP_WIDTH * 2;
minimap.height = MAP_HEIGHT * 2;
const mapPaint = minimap.getContext("2d")!;
const mapBase = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = CITY_W;
  canvas.height = CITY_H;
  const g = canvas.getContext("2d")!;
  const image = g.createImageData(CITY_W, CITY_H);
  const colors: Record<number, [number, number, number]> = {
    [Surface.Building]: [23, 31, 44],
    [Surface.Road]: [226, 234, 240],
    [Surface.Sidewalk]: [57, 70, 85],
    [Surface.Alley]: [151, 173, 190],
    [Surface.Grass]: [35, 65, 56],
    [Surface.Water]: [36, 80, 114],
    [Surface.Market]: [63, 66, 73],
    [Surface.Path]: [120, 144, 133],
    [Surface.Stall]: [36, 40, 49],
    [Surface.Median]: [96, 153, 73],
  };
  for (let i = 0; i < GROUND.length; i += 1) {
    const [r, gr, b] = colors[GROUND[i]] ?? [23, 31, 44];
    image.data.set([r, gr, b, 255], i * 4);
  }
  g.putImageData(image, 0, 0);
  return canvas;
})();
const MAP_LEGS: [number, number][][] = [
  [[HOME.x, HOME.y], [253, 19], [253, 52]],
  [[253, 52], [253, 180]],
  [[253, 180], [253, 205], [216, 205]],
  [[216, 205], [99, 205], [99, 176]],
  [[99, 176], [99, 112]],
];

function drawMinimap() {
  const g = mapPaint;
  const s = t();
  g.setTransform(2, 0, 0, 2, 0, 0);
  g.fillStyle = "#101925";
  g.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  g.font = "bold 13px system-ui";
  g.fillStyle = "#f3f6fa";
  g.textAlign = "left";
  g.fillText(s.navigation, MAP_PAD, 21);
  g.save();
  g.translate(MAP_PAD, MAP_TOP);
  g.drawImage(mapBase, 0, 0);
  const trip = state.commute;
  if (trip) {
    g.lineCap = "round";
    g.lineJoin = "round";
    MAP_LEGS.forEach((points, i) => {
      if (i < trip.checkpoint) return;
      for (const [width, color] of [[8, "#101925"], [4, i === trip.checkpoint ? "#ffbb47" : "#49b4ef"]] as const) {
        g.lineWidth = width;
        g.strokeStyle = color;
        g.beginPath();
        points.forEach(([x, y], j) => j ? g.lineTo(x, y) : g.moveTo(x, y));
        g.stroke();
      }
    });
    POLICE_POSTS.forEach((post) => {
      g.fillStyle = "#315cce";
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1;
      g.fillRect(post.x + 5, post.y - 10, 9, 10);
      g.strokeRect(post.x + 5, post.y - 10, 9, 10);
    });
    g.fillStyle = "#51ddae";
    g.strokeStyle = "#101925";
    g.lineWidth = 2;
    g.fillRect(OFFICE.x - 7, OFFICE.y - 7, 14, 14);
    g.strokeRect(OFFICE.x - 7, OFFICE.y - 7, 14, 14);
    g.font = "bold 12px system-ui";
    g.lineWidth = 4;
    g.strokeText(s.office, OFFICE.x + 12, OFFICE.y + 4);
    g.fillText(s.office, OFFICE.x + 12, OFFICE.y + 4);
  }
  const target = trip ? COMMUTE_STOPS[trip.checkpoint] : GATES[state.racers[focus]?.gate ?? 0];
  if (target) {
    g.strokeStyle = "#101925";
    g.fillStyle = "#ffbb47";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(target.x, target.y, 7, 0, Math.PI * 2);
    g.fill(); g.stroke();
    g.fillStyle = "#101925";
    g.textAlign = "center";
    g.font = "bold 10px system-ui";
    g.fillText(String((trip?.checkpoint ?? 0) + 1), target.x, target.y + 3);
  }
  const me = state.racers[focus];
  if (me) {
    g.translate(me.x, me.y);
    g.rotate(me.heading);
    g.beginPath();
    g.moveTo(11, 0); g.lineTo(-7, -7); g.lineTo(-4, 0); g.lineTo(-7, 7); g.closePath();
    g.fillStyle = "#ffffff";
    g.strokeStyle = "#1460d4";
    g.lineWidth = 3;
    g.fill(); g.stroke();
  }
  g.restore();
  g.font = "11px system-ui";
  g.textAlign = "left";
  const legendY = MAP_TOP + CITY_H + 20;
  [["#ffffff", s.mapYou, 16], ["#ffbb47", s.mapNext, 144], ["#49b4ef", s.mapLater, 245]].forEach(([color, text, x]) => {
    g.fillStyle = String(color);
    g.fillRect(Number(x), legendY - 7, 7, 7);
    g.fillStyle = "#e2eaf0";
    g.fillText(String(text), Number(x) + 11, legendY);
  });
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
  const trip = state.commute;
  detention.hidden = !trip || trip.stoppedTicks <= 0 || state.phase === "done";
  if (!detention.hidden && trip) {
    detention.innerHTML = `<strong>${trip.notice === "wrongDirection" ? s.wrongDirection : s.police}</strong><b>${s.detained} ${(trip.stoppedTicks / TICK_RATE).toFixed(1)}s</b><small>${trip.laneRespawn ? s.laneReturnHint : s.detentionHint}</small>`;
  }
  const morningSeconds = trip ? Math.min(180, Math.floor(commuteElapsed(state) / trip.deadlineTicks * 180)) : 0;
  const clock = `${String(7 + Math.floor((57 * 60 + morningSeconds) / 3600)).padStart(2, "0")}:${String(Math.floor((57 * 60 + morningSeconds) / 60) % 60).padStart(2, "0")}:${String(morningSeconds % 60).padStart(2, "0")}`;
  hud.innerHTML = trip ?
    `<div class="chip"><small>${s.clock}</small><b>${clock}</b></div>` +
    `<div class="chip ${commuteRemaining(state) < 20 * TICK_RATE ? "urgent" : ""}"><small>${s.remaining}</small><b>${formatTime(commuteRemaining(state))}</b></div>` +
    `<div class="chip"><small>${s.route} → ${s.office}</small><b>${Math.min(COMMUTE_STOPS.length, trip.checkpoint + 1)}</b>/${COMMUTE_STOPS.length}</div>` +
    `<div class="chip speed"><small>km/h</small><b>${kmh}</b></div>` +
    `<div class="commute-notice" role="status">${trip.notice && state.tick < trip.noticeUntil ? s[trip.notice] : s.commuteHint}</div>` :
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
      const finishedState = state;
      setTimeout(() => {
        if (mode === "race" && state === finishedState && state.phase === "done") showResults();
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
