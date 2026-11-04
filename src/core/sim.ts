import { botInput } from "./bot";
import { createCommute, HOME, releaseDetainedRider, stepCommute } from "./commute";
import { CITY_H, CITY_W, GATES, GROUND, isSolid, NETWORK, surfaceAt } from "./city";
import { clamp, random } from "./rng";
import { bodyOfNpc, bodyOfRacer, type Body, Grid, honkAt, SIZES, spawnTraffic, stepTraffic } from "./traffic";
import {
  COUNTDOWN_TICKS,
  DT,
  FINISH_GRACE_TICKS,
  type GameState,
  type Input,
  LAPS,
  NO_INPUT,
  type Racer,
  Surface,
} from "./types";

/**
 * The race rules: bike handling, crashes, near misses, slipstream, gates and laps. Pure and
 * deterministic: the same seed and the same inputs always give the same race.
 */

export const RACER_RADIUS = 0.45;
export const MAX_SPEED = 22;
export const BOOST_SPEED = 30;
const ACCEL = 10;
const BOOST_ACCEL = 17;
const BRAKE = 24;
const REVERSE_MAX = 4.5;
/** Hitting a wall or a vehicle harder than this throws the rider off. */
export const CRASH_SPEED = 12.5;
export const CRASH_TICKS = 75;
const GHOST_TICKS = 80;
const HONK_COOLDOWN = 45;
/** A pass this close (in metres, body to body) at speed counts as a near miss. */
export const NEAR_MISS_GAP = 0.75;
const NEAR_MISS_SPEED = 12;
const SAFE_EVERY = 20;

interface Grip {
  /** Top speed as a share of the open-road top speed. */
  speed: number;
  /** How quickly sideways slide is cancelled, per second. */
  grip: number;
}

const GRIP: Partial<Record<Surface, Grip>> = {
  [Surface.Road]: { speed: 1, grip: 9 },
  [Surface.Alley]: { speed: 0.97, grip: 9 },
  [Surface.Sidewalk]: { speed: 0.8, grip: 8 },
  [Surface.Path]: { speed: 0.8, grip: 7 },
  [Surface.Grass]: { speed: 0.58, grip: 4 },
  [Surface.Market]: { speed: 0.55, grip: 7 },
};
const NO_GRIP: Grip = { speed: 0.5, grip: 4 };

export const BOT_NAMES = ["Shipper Tuấn", "Cô Lan bán xôi", "Anh xe ôm Hùng", "Bé Na đi học", "Chú Bảy ba gác"];
export const DIFFICULTY_POWER = [0.86, 0.94, 1];

export interface RaceOptions {
  mode?: "race" | "commute";
  seed: number;
  /** How many bots race the player. */
  bots: number;
  /** 0 easy, 1 normal, 2 hard. */
  difficulty: number;
  laps?: number;
  playerName?: string;
  /** How many players drive with real inputs; the rest are bots. */
  humans?: number;
  /** Traffic density, 1 is rush hour. */
  traffic?: number;
}

function makeRacer(id: number, name: string, bot: boolean, power: number, x: number, y: number): Racer {
  return {
    id,
    name,
    bot,
    power,
    look: id,
    x,
    y,
    vx: 0,
    vy: 0,
    heading: 0,
    px: x,
    py: y,
    ph: 0,
    steer: 0,
    throttle: 0,
    boost: 0.3,
    boostTicks: 0,
    crashed: 0,
    ghost: 0,
    honkCooldown: 0,
    lap: 0,
    gate: 1,
    finishTick: -1,
    lapStartTick: 0,
    bestLap: 0,
    safeX: x,
    safeY: y,
    safeHeading: 0,
    combo: 0,
    comboTimer: 0,
    nearMisses: 0,
    crashes: 0,
    waypoint: 0,
    shift: 0,
    stuck: 0,
    reverseTicks: 0,
    drown: false,
  };
}

/** Start grid: two columns on the avenue, just past the start line. Human players start at the back. */
const GRID_SLOTS: [number, number][] = [
  [80, 13],
  [80, 19],
  [73, 13],
  [73, 19],
  [66, 13],
  [66, 19],
];

export function createGame(options: RaceOptions): GameState {
  const state: GameState = {
    tick: 0,
    rng: options.seed | 0,
    phase: "countdown",
    startTick: COUNTDOWN_TICKS,
    closeTick: -1,
    laps: options.laps ?? LAPS,
    racers: [],
    npcs: [],
    events: [],
    finishers: [],
  };
  const humans = options.humans ?? 1;
  const total = Math.min(GRID_SLOTS.length, humans + options.bots);
  const power = DIFFICULTY_POWER[clamp(options.difficulty, 0, 2)];
  const names = [...BOT_NAMES];
  for (let i = 0; i < total; i += 1) {
    const human = i < humans;
    // Humans take the slots at the back of the grid.
    const [x, y] = GRID_SLOTS[total - 1 - i];
    let name = options.playerName ?? "Bạn";
    if (!human) name = names.splice(Math.floor(random(state) * names.length), 1)[0];
    else if (humans > 1) name = `${options.playerName ?? "P"}${i + 1}`;
    state.racers.push(makeRacer(i, name, !human, human ? 1 : power, x, y));
  }
  if (options.mode === "commute") {
    state.commute = createCommute(options.difficulty);
    state.laps = 1;
    const rider = makeRacer(0, options.playerName ?? "Bạn", false, 1, HOME.x, HOME.y);
    rider.heading = rider.ph = rider.safeHeading = HOME.heading;
    state.racers = [rider];
  }
  state.npcs = spawnTraffic(state, NETWORK, options.traffic ?? 1);
  return state;
}

const grid = new Grid(CITY_W, CITY_H);
let bodies: Body[] = [];

function rebuildBodies(state: GameState) {
  bodies = state.npcs.map(bodyOfNpc).concat(state.racers.map(bodyOfRacer));
  grid.rebuild(bodies);
}

const circleHitsWorld = (x: number, y: number, r: number) => {
  for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy += 1) {
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx += 1) {
      if (!isSolid(surfaceAt(GROUND, cx, cy))) continue;
      const dx = x - clamp(x, cx, cx + 1);
      const dy = y - clamp(y, cy, cy + 1);
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
};

export const gripAt = (x: number, y: number): Grip => GRIP[surfaceAt(GROUND, x, y)] ?? NO_GRIP;

export const forwardSpeed = (racer: Racer) => racer.vx * Math.cos(racer.heading) + racer.vy * Math.sin(racer.heading);

function crash(state: GameState, racer: Racer, hard: boolean) {
  if (racer.crashed > 0) return;
  racer.crashed = CRASH_TICKS;
  racer.crashes += 1;
  racer.boostTicks = 0;
  racer.combo = 0;
  state.events.push({ type: "crash", racer: racer.id, x: racer.x, y: racer.y, hard });
}

export function respawn(racer: Racer) {
  racer.x = racer.px = racer.safeX;
  racer.y = racer.py = racer.safeY;
  racer.heading = racer.ph = racer.safeHeading;
  racer.vx = 0;
  racer.vy = 0;
  racer.crashed = 0;
  racer.drown = false;
  racer.ghost = GHOST_TICKS;
  racer.boostTicks = 0;
}

function drive(racer: Racer, input: Input) {
  const cos = Math.cos(racer.heading);
  const sin = Math.sin(racer.heading);
  let forward = racer.vx * cos + racer.vy * sin;
  let lateral = -racer.vx * sin + racer.vy * cos;
  const ground = gripAt(racer.x, racer.y);
  const boosting = racer.boostTicks > 0;
  const top = (boosting ? BOOST_SPEED : MAX_SPEED) * racer.power * (boosting ? Math.max(ground.speed, 0.8) : ground.speed);
  const throttle = clamp(input.throttle, -1, 1);
  const steer = clamp(input.steer, -1, 1);
  racer.steer = steer;
  racer.throttle = throttle;

  if (throttle > 0) {
    if (forward < top) {
      const accel = boosting ? BOOST_ACCEL : ACCEL;
      forward = Math.min(top, forward + accel * throttle * (1 - 0.55 * Math.max(0, forward) / top) * DT);
    }
  } else if (throttle < 0) {
    if (forward > 0.4) forward = Math.max(0, forward - BRAKE * -throttle * DT);
    else forward = Math.max(-REVERSE_MAX, forward - 7 * -throttle * DT);
  } else {
    forward -= forward * 0.7 * DT + Math.sign(forward) * 0.6 * DT;
    if (Math.abs(forward) < 0.15) forward = 0;
  }
  if (boosting && throttle >= 0) forward = Math.min(top, forward + BOOST_ACCEL * 0.5 * DT);
  // Over the limit (off the road, or a boost running out): bleed speed quickly but not instantly.
  if (forward > top) forward = Math.max(top, forward - 16 * DT);

  lateral *= Math.max(0, 1 - ground.grip * DT);

  const speedShare = Math.min(1, Math.abs(forward) / MAX_SPEED);
  const rate = 3.0 - 1.25 * speedShare;
  const lowSpeed = Math.min(1, Math.abs(forward) / 3.5);
  racer.heading += steer * rate * lowSpeed * Math.sign(forward || 1) * DT;
  // Turning hard at speed lets the rear step out a little: the bike drifts instead of pivoting.
  lateral -= steer * forward * speedShare * 0.5 * DT;

  const ncos = Math.cos(racer.heading);
  const nsin = Math.sin(racer.heading);
  racer.vx = ncos * forward - nsin * lateral;
  racer.vy = nsin * forward + ncos * lateral;
}

/** Moves a racer through the world, sliding along walls. Returns the hardest impact speed. */
function move(racer: Racer) {
  let impact = 0;
  const steps = 2;
  for (let i = 0; i < steps; i += 1) {
    const nx = racer.x + (racer.vx * DT) / steps;
    if (circleHitsWorld(nx, racer.y, RACER_RADIUS)) {
      impact = Math.max(impact, Math.abs(racer.vx));
      racer.vx *= -0.15;
    } else racer.x = nx;
    const ny = racer.y + (racer.vy * DT) / steps;
    if (circleHitsWorld(racer.x, ny, RACER_RADIUS)) {
      impact = Math.max(impact, Math.abs(racer.vy));
      racer.vy *= -0.15;
    } else racer.y = ny;
  }
  return impact;
}

/** Closest point to (x, y) on the centre line of a vehicle's body. */
function closestOnBody(body: Body, x: number, y: number) {
  const cos = Math.cos(body.heading);
  const sin = Math.sin(body.heading);
  const half = Math.max(0, body.size.length / 2 - body.size.width / 2);
  const along = clamp((x - body.x) * cos + (y - body.y) * sin, -half, half);
  return { x: body.x + cos * along, y: body.y + sin * along };
}

function trafficContact(state: GameState, racer: Racer) {
  const bit = 1 << racer.id;
  const speed = Math.hypot(racer.vx, racer.vy);
  const cos = Math.cos(racer.heading);
  const sin = Math.sin(racer.heading);
  grid.near(racer.x, racer.y, 9, (index) => {
    if (index >= state.npcs.length) return;
    const npc = state.npcs[index];
    const body = bodies[index];
    const at = closestOnBody(body, racer.x, racer.y);
    let dx = racer.x - at.x;
    let dy = racer.y - at.y;
    let distance = Math.hypot(dx, dy);
    const reach = SIZES[npc.kind].width / 2 + RACER_RADIUS;
    const gap = distance - reach;
    const nvx = Math.cos(npc.heading) * npc.speed;
    const nvy = Math.sin(npc.heading) * npc.speed;

    // Slipstream: tucked in close behind something big, the bike charges its boost.
    if (npc.kind !== "bike" && racer.crashed === 0) {
      const rx = npc.x - racer.x;
      const ry = npc.y - racer.y;
      const along = rx * cos + ry * sin;
      const side = Math.abs(-rx * sin + ry * cos);
      const aligned = Math.cos(npc.heading - racer.heading) > 0.9;
      if (aligned && side < SIZES[npc.kind].width / 2 + 0.5 && along > 1 && along < SIZES[npc.kind].length / 2 + 9 && speed > 7) {
        racer.boost = Math.min(1, racer.boost + 0.0035);
      }
    }

    if (gap > 4) npc.missMask &= ~bit;
    if (racer.crashed > 0 || racer.ghost > 0) return;
    if (gap < 0) {
      if (distance < 1e-4) {
        dx = -sin;
        dy = cos;
        distance = 1;
      }
      const nx = dx / distance;
      const ny = dy / distance;
      const pushedX = racer.x - nx * gap;
      const pushedY = racer.y - ny * gap;
      if (!circleHitsWorld(pushedX, racer.y, RACER_RADIUS)) racer.x = pushedX;
      if (!circleHitsWorld(racer.x, pushedY, RACER_RADIUS)) racer.y = pushedY;
      const closing = -((racer.vx - nvx) * nx + (racer.vy - nvy) * ny);
      if (closing > CRASH_SPEED) {
        crash(state, racer, true);
        npc.stunned = 50;
        racer.vx = nvx + (racer.vx - nvx) * 0.3;
        racer.vy = nvy + (racer.vy - nvy) * 0.3;
        return;
      }
      if (closing > 0) {
        racer.vx += nx * closing * 1.25;
        racer.vy += ny * closing * 1.25;
        if (closing > 1.5) state.events.push({ type: "bump", racer: racer.id, x: racer.x, y: racer.y, strength: closing });
      }
      if (npc.kind === "bike" || npc.kind === "cart") {
        // Shoved: the rider wobbles sideways and slows down.
        const side = (racer.x - npc.x) * -Math.sin(npc.heading) + (racer.y - npc.y) * Math.cos(npc.heading);
        npc.targetOffset += side > 0 ? -0.6 : 0.6;
        npc.startled = 40;
        npc.speed *= 0.85;
      }
      return;
    }
    const relative = Math.hypot(racer.vx - nvx, racer.vy - nvy);
    if (gap < NEAR_MISS_GAP && speed > NEAR_MISS_SPEED && relative > 6 && !(npc.missMask & bit)) {
      npc.missMask |= bit;
      racer.combo = racer.comboTimer > 0 ? racer.combo + 1 : 1;
      racer.comboTimer = 150;
      racer.nearMisses += 1;
      racer.boost = Math.min(1, racer.boost + 0.07 + 0.025 * Math.min(racer.combo, 6));
      state.events.push({ type: "nearMiss", racer: racer.id, x: racer.x, y: racer.y, combo: racer.combo });
    }
  });
}

function racerContact(state: GameState) {
  const racers = state.racers;
  for (let i = 0; i < racers.length; i += 1) {
    for (let j = i + 1; j < racers.length; j += 1) {
      const a = racers[i];
      const b = racers[j];
      if (a.crashed || b.crashed || a.ghost || b.ghost) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const reach = RACER_RADIUS * 2 + 0.1;
      if (distance >= reach || distance < 1e-4) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const push = (reach - distance) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (closing <= 0) continue;
      a.vx -= nx * closing * 0.6;
      a.vy -= ny * closing * 0.6;
      b.vx += nx * closing * 0.6;
      b.vy += ny * closing * 0.6;
      if (closing > 14) {
        crash(state, a, true);
        crash(state, b, true);
      } else if (closing > 2) state.events.push({ type: "bump", racer: a.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, strength: closing });
    }
  }
}

function checkGates(state: GameState, racer: Racer) {
  if (racer.finishTick >= 0 || racer.crashed > 0) return;
  const gate = GATES[racer.gate];
  if (Math.hypot(racer.x - gate.x, racer.y - gate.y) > gate.r) return;
  if (racer.gate === 0) {
    racer.lap += 1;
    const time = state.tick - racer.lapStartTick;
    if (racer.bestLap === 0 || time < racer.bestLap) racer.bestLap = time;
    racer.lapStartTick = state.tick;
    if (racer.lap >= state.laps) {
      racer.finishTick = state.tick;
      state.finishers.push(racer.id);
      state.events.push({ type: "finish", racer: racer.id, place: state.finishers.length, time: state.tick - state.startTick });
      if (!racer.bot && state.closeTick < 0) state.closeTick = state.tick + FINISH_GRACE_TICKS;
    } else state.events.push({ type: "lap", racer: racer.id, lap: racer.lap, time });
  } else state.events.push({ type: "gate", racer: racer.id });
  racer.gate = (racer.gate + 1) % GATES.length;
}

/** How far round the course a racer is, for the standings. Bigger is further. */
export function progressOf(racer: Racer) {
  const passed = (racer.gate + GATES.length - 1) % GATES.length;
  const gate = GATES[racer.gate];
  return (racer.lap * GATES.length + passed) * 1000 - Math.hypot(racer.x - gate.x, racer.y - gate.y);
}

/** Racer ids from first to last: finishers in finishing order, then everyone else by progress. */
export function standings(state: GameState): number[] {
  const running = state.racers
    .filter((r) => r.finishTick < 0)
    .sort((a, b) => progressOf(b) - progressOf(a))
    .map((r) => r.id);
  return [...state.finishers, ...running];
}

/** Advances the race by one tick. `inputs[i]` drives racer i; bots ignore it and drive themselves. */
export function step(state: GameState, inputs: (Input | undefined)[]): GameState {
  if (state.phase === "done") {
    state.events = [];
    return state;
  }
  state.tick += 1;
  state.events = [];
  if (state.phase === "countdown") {
    const left = state.startTick - state.tick;
    if (left % 60 === 0 && left > 0) state.events.push({ type: "count", value: left / 60 });
    if (left <= 0) {
      state.phase = "race";
      state.events.push({ type: "count", value: 0 });
      for (const racer of state.racers) racer.lapStartTick = state.tick;
    }
  }

  rebuildBodies(state);
  stepTraffic(state, grid, bodies, NETWORK);
  const racing = state.phase !== "countdown";

  for (const racer of state.racers) {
    racer.px = racer.x;
    racer.py = racer.y;
    racer.ph = racer.heading;
    if (racer.honkCooldown > 0) racer.honkCooldown -= 1;
    if (racer.comboTimer > 0 && (racer.comboTimer -= 1) === 0) racer.combo = 0;
    if (racer.ghost > 0) racer.ghost -= 1;

    if (state.commute && state.commute.stoppedTicks > 0) {
      state.commute.stoppedTicks -= 1;
      state.commute.penaltyTicks += 1;
      // Traffic must not shove the detained rider away or cause a second crash.
      racer.ghost = Math.max(racer.ghost, 2);
      racer.vx = racer.vy = 0;
      racer.throttle = racer.steer = 0;
      racer.boostTicks = 0;
      if (state.commute.stoppedTicks === 0) releaseDetainedRider(state);
      continue;
    }

    if (racer.crashed > 0) {
      racer.crashed -= 1;
      racer.vx *= 0.9;
      racer.vy *= 0.9;
      move(racer);
      if (racer.crashed === 0) {
        if (racer.drown) respawn(racer);
        else racer.ghost = GHOST_TICKS;
      }
      continue;
    }

    let input = racing ? (racer.bot ? botInput(state, racer, grid, bodies) : inputs[racer.id] ?? NO_INPUT) : NO_INPUT;
    if (racer.finishTick >= 0 && !racer.bot) input = { ...NO_INPUT, throttle: 0, steer: input.steer };
    if (input.reset && racing) {
      respawn(racer);
      continue;
    }
    if (input.honk && racer.honkCooldown <= 0) {
      racer.honkCooldown = HONK_COOLDOWN;
      honkAt(state, racer, grid, NETWORK);
      state.events.push({ type: "honk", racer: racer.id, x: racer.x, y: racer.y });
    }
    if (input.boost && racer.boostTicks <= 0 && racer.boost >= 0.3) {
      racer.boostTicks = Math.round(50 + racer.boost * 130);
      racer.boost = 0;
      state.events.push({ type: "boost", racer: racer.id });
    }
    if (racer.boostTicks > 0) racer.boostTicks -= 1;

    drive(racer, input);
    const impact = move(racer);
    if (impact > CRASH_SPEED) crash(state, racer, true);
    else if (impact > 3) state.events.push({ type: "bump", racer: racer.id, x: racer.x, y: racer.y, strength: impact });

    if (surfaceAt(GROUND, racer.x, racer.y) === Surface.Water && racer.crashed === 0) {
      racer.drown = true;
      crash(state, racer, false);
      state.events.pop();
      state.events.push({ type: "splash", racer: racer.id, x: racer.x, y: racer.y });
    }

    const surface = surfaceAt(GROUND, racer.x, racer.y);
    if (state.tick % SAFE_EVERY === 0 && racer.crashed === 0 && (surface === Surface.Road || surface === Surface.Alley) && forwardSpeed(racer) > 2) {
      racer.safeX = racer.x;
      racer.safeY = racer.y;
      racer.safeHeading = racer.heading;
    }
  }

  // Contacts use the racers' new positions.
  for (let i = 0; i < state.racers.length; i += 1) {
    const racer = state.racers[i];
    const body = bodies[state.npcs.length + i];
    body.x = racer.x;
    body.y = racer.y;
    body.heading = racer.heading;
    trafficContact(state, racer);
  }
  racerContact(state);
  if (state.commute) stepCommute(state);
  else if (racing) for (const racer of state.racers) checkGates(state, racer);

  if (state.phase === "race" && !state.commute) {
    const humans = state.racers.filter((r) => !r.bot);
    const everyone = state.racers.every((r) => r.finishTick >= 0);
    const humansDone = humans.length > 0 && humans.every((r) => r.finishTick >= 0);
    if (everyone || (humansDone && state.tick >= state.closeTick)) state.phase = "done";
  }
  return state;
}

/** A small fingerprint of the whole race, for checking two runs agree. */
export function stateHash(state: GameState): number {
  let hash = state.tick;
  const mix = (value: number) => {
    hash = (Math.imul(hash, 31) + Math.round(value * 1000)) | 0;
  };
  for (const r of state.racers) {
    mix(r.x);
    mix(r.y);
    mix(r.heading);
    mix(r.lap);
    mix(r.gate);
  }
  for (const n of state.npcs) {
    mix(n.x);
    mix(n.y);
  }
  if (state.commute) {
    mix(state.commute.checkpoint);
    mix(state.commute.penaltyTicks);
    mix(state.commute.stoppedTicks);
    mix(state.commute.violations);
    mix(state.commute.potholeHits);
  }
  mix(state.rng);
  return hash;
}
