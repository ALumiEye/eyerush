import { CORNER, lightFor, NETWORK } from "./city";
import type { CommuteState, GameState, Racer } from "./types";
import { TICK_RATE } from "./types";

export const POLICE_HOLD_TICKS = 5 * TICK_RATE;
export const HOME = { x: 56, y: 19, heading: 0 };
export const COMMUTE_STOPS = [
  { x: 256, y: 52, r: 10, heading: Math.PI / 2 },
  { x: 256, y: 180, r: 10, heading: Math.PI / 2 },
  { x: 216, y: 208, r: 10, heading: Math.PI },
  { x: 96, y: 176, r: 10, heading: -Math.PI / 2 },
  { x: 96, y: 112, r: 10, heading: -Math.PI / 2 },
];
export const OFFICE = COMMUTE_STOPS[COMMUTE_STOPS.length - 1];
export const POLICE_POSTS = [[176, 16], [256, 80], [96, 208]].map(([x, y]) => ({
  x, y, nodeId: NETWORK.nodes.find((node) => node.x === x && node.y === y)!.id,
}));
export const POTHOLES: { x: number; y: number; rx: number; ry: number; kind: "pothole" | "crater" }[] = [
  { x: 118, y: 19, rx: 1.5, ry: 1.1, kind: "pothole" },
  { x: 209, y: 20, rx: 2.5, ry: 1.5, kind: "crater" },
  { x: 253, y: 108, rx: 1.2, ry: 1.7, kind: "pothole" },
  { x: 255, y: 160, rx: 2.1, ry: 2.7, kind: "crater" },
  { x: 182, y: 205, rx: 1.7, ry: 1.2, kind: "pothole" },
  { x: 132, y: 204, rx: 2.6, ry: 1.5, kind: "crater" },
  { x: 99, y: 152, rx: 1.2, ry: 1.6, kind: "pothole" },
  { x: 173, y: 111, rx: 1.6, ry: 2.3, kind: "crater" },
  { x: 215, y: 82, rx: 1.5, ry: 1.2, kind: "pothole" },
];

export function createCommute(difficulty: number): CommuteState {
  return {
    deadlineTicks: [180, 150, 120][Math.max(0, Math.min(2, Math.floor(difficulty)))] * TICK_RATE,
    penaltyTicks: 0, violations: 0, potholeHits: 0, stoppedTicks: 0,
    notice: null, laneRespawn: null, noticeUntil: 0, outcome: "travelling", checkpoint: 0, touchingHoles: [],
  };
}

export function commuteElapsed(state: GameState) {
  const end = state.racers[0]?.finishTick ?? -1;
  // Detention consumes real simulation ticks, not an additional clock jump.
  return Math.max(0, (end >= 0 ? end : state.tick) - state.startTick);
}
export function commuteRemaining(state: GameState) {
  return Math.max(0, (state.commute?.deadlineTicks ?? 0) - commuteElapsed(state));
}

/** Test the actual swept stop-line crossing, not proximity to a red lamp. */
export function crossedRedLight(racer: Racer, tick: number) {
  for (const node of NETWORK.nodes) {
    if (!node.light) continue;
    for (const id of node.edges) {
      const edge = NETWORK.edges[id];
      const from = NETWORK.nodes[edge.a === node.id ? edge.b : edge.a];
      const dx = (node.x - from.x) / edge.length;
      const dy = (node.y - from.y) / edge.length;
      const stop = Math.max(CORNER, (edge.vertical ? node.halfH : node.halfV) + 2) - 0.2;
      const x = node.x - dx * stop;
      const y = node.y - dy * stop;
      const before = (racer.px - x) * dx + (racer.py - y) * dy;
      const after = (racer.x - x) * dx + (racer.y - y) * dy;
      if (before >= 0 || after < 0 || after <= before) continue;
      const fraction = -before / (after - before);
      const cx = racer.px + (racer.x - racer.px) * fraction;
      const cy = racer.py + (racer.y - racer.py) * fraction;
      const side = (cx - x) * -dy + (cy - y) * dx;
      // Both incoming lanes and their sidewalk are monitored, so swerving onto the
      // pavement cannot bypass a red light; nearby parallel streets are excluded.
      if (Math.abs(side) > edge.width / 2 + 3) continue;
      if (lightFor(node, edge.vertical, tick) === "red") return node;
    }
  }
  return null;
}

/** Only travel along a road counts; junction turns and tiny reverse manoeuvres do not. */
export function wrongWayLane(rider: Racer) {
  for (const edge of NETWORK.edges) {
    const a = NETWORK.nodes[edge.a];
    const b = NETWORK.nodes[edge.b];
    const dx = (b.x - a.x) / edge.length;
    const dy = (b.y - a.y) / edge.length;
    const along = (rider.x - a.x) * dx + (rider.y - a.y) * dy;
    const side = (rider.x - a.x) * -dy + (rider.y - a.y) * dx;
    const cutA = Math.max(CORNER + 4, (edge.vertical ? a.halfH : a.halfV) + 4);
    const cutB = Math.max(CORNER + 4, (edge.vertical ? b.halfH : b.halfV) + 4);
    if (along <= cutA || along >= edge.length - cutB || Math.abs(side) < 0.8 || Math.abs(side) > edge.width / 2) continue;
    const speed = rider.vx * dx + rider.vy * dy;
    const across = rider.vx * -dy + rider.vy * dx;
    if (Math.abs(speed) < 2 || Math.abs(across) > Math.abs(speed) * 0.6 || side * speed >= 0) continue;
    const direction = Math.sign(speed);
    const offset = direction * edge.width / 4;
    return {
      x: a.x + dx * along - dy * offset,
      y: a.y + dy * along + dx * offset,
      heading: Math.atan2(dy * direction, dx * direction),
    };
  }
  return null;
}

export function releaseDetainedRider(state: GameState) {
  const trip = state.commute;
  if (!trip?.laneRespawn || commuteRemaining(state) <= 0) return;
  const rider = state.racers[0];
  const lane = trip.laneRespawn;
  rider.x = rider.px = rider.safeX = lane.x;
  rider.y = rider.py = rider.safeY = lane.y;
  rider.heading = rider.ph = rider.safeHeading = lane.heading;
  rider.vx = rider.vy = 0;
  rider.ghost = 80;
  trip.laneRespawn = null;
}

export function stepCommute(state: GameState) {
  const trip = state.commute;
  const rider = state.racers[0];
  if (!trip || state.phase !== "race") return;
  if (rider.crashed === 0 && trip.stoppedTicks === 0) {
    const red = crossedRedLight(rider, state.tick);
    const wrongLane = wrongWayLane(rider);
    if (red || wrongLane) {
      trip.violations += 1;
      trip.stoppedTicks = POLICE_HOLD_TICKS;
      trip.notice = wrongLane ? "wrongDirection" : "police";
      trip.laneRespawn = wrongLane;
      trip.noticeUntil = state.tick + POLICE_HOLD_TICKS;
      rider.vx = rider.vy = 0;
      rider.boostTicks = 0;
    }
    const touching: number[] = [];
    POTHOLES.forEach((hole, index) => {
      if (Math.hypot((rider.x - hole.x) / hole.rx, (rider.y - hole.y) / hole.ry) >= 1) return;
      touching.push(index);
      const speed = Math.hypot(rider.vx, rider.vy);
      if (trip.touchingHoles.includes(index) || rider.ghost > 0 || speed < 3) return;
      trip.potholeHits += 1;
      trip.notice = hole.kind;
      trip.noticeUntil = state.tick + 3 * TICK_RATE;
      const hard = hole.kind === "crater" && speed > 9;
      rider.vx *= hard ? 0.15 : 0.45;
      rider.vy *= hard ? 0.15 : 0.45;
      rider.boostTicks = 0;
      state.events.push({ type: "bump", racer: 0, x: rider.x, y: rider.y, strength: speed });
      if (hard) {
        rider.crashed = 75;
        rider.crashes += 1;
        rider.combo = 0;
        state.events.push({ type: "crash", racer: 0, x: rider.x, y: rider.y, hard: true });
      }
    });
    trip.touchingHoles = touching;
  }

  // The deadline keeps running during crashes and detention, and takes precedence.
  if (commuteRemaining(state) <= 0) {
    trip.outcome = "late";
    state.phase = "done";
    rider.vx = rider.vy = 0;
    return;
  }
  const stop = COMMUTE_STOPS[trip.checkpoint];
  if (stop && rider.crashed === 0 && trip.stoppedTicks === 0 && Math.hypot(rider.x - stop.x, rider.y - stop.y) < stop.r) {
    trip.checkpoint += 1;
    state.events.push({ type: "gate", racer: 0 });
    if (trip.checkpoint === COMMUTE_STOPS.length) {
      trip.outcome = "onTime";
      rider.finishTick = state.tick;
      rider.vx = rider.vy = 0;
      state.finishers.push(0);
      state.phase = "done";
      state.events.push({ type: "finish", racer: 0, place: 1, time: commuteElapsed(state) });
    }
  }
}
