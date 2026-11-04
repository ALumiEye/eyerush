import { GROUND, isSolid, ROUTE, surfaceAt } from "./city";
import { angleDiff, clamp, random } from "./rng";
import { type Body, type Grid } from "./traffic";
import { type GameState, type Input, type Racer, Surface } from "./types";

/**
 * Bots ride the course's line (the junction centres in ROUTE) and weave through traffic: each tick
 * they try a handful of sideways shifts of a point ahead and pick the one with the clearest path,
 * looking at where every vehicle will be by the time they get there. They brake for corners,
 * honk at what is in the way, save boost for the straights and back out when stuck.
 */

const SHIFTS = [-4, -2.5, -1.2, 0, 1.2, 2.5, 4];
const CORNER_SPEED = 11.5;
const BRAKING = 17;
const SURFACE_COST: Partial<Record<Surface, number>> = {
  [Surface.Sidewalk]: 1.5,
  [Surface.Path]: 2,
  [Surface.Grass]: 6,
  [Surface.Market]: 6,
};

const segment = (i: number) => {
  const [ax, ay] = ROUTE[i % ROUTE.length];
  const [bx, by] = ROUTE[(i + 1) % ROUTE.length];
  const length = Math.hypot(bx - ax, by - ay);
  return { ax, ay, bx, by, length, dx: (bx - ax) / length, dy: (by - ay) / length };
};

function project(i: number, x: number, y: number) {
  const s = segment(i);
  const t = clamp((x - s.ax) * s.dx + (y - s.ay) * s.dy, 0, s.length);
  const px = s.ax + s.dx * t;
  const py = s.ay + s.dy * t;
  return { t, distance: Math.hypot(x - px, y - py), length: s.length };
}

/** The point `ahead` metres further along the route from distance `t` on segment `i`. */
function along(i: number, t: number, ahead: number) {
  let index = i;
  let rest = t + ahead;
  let s = segment(index);
  while (rest > s.length) {
    rest -= s.length;
    index += 1;
    s = segment(index);
  }
  return { x: s.ax + s.dx * rest, y: s.ay + s.dy * rest, dx: s.dx, dy: s.dy };
}

/** Distance from a point to a vehicle's body, at its predicted position `t` seconds from now. */
function clearance(body: Body, speed: number, t: number, x: number, y: number) {
  const cos = Math.cos(body.heading);
  const sin = Math.sin(body.heading);
  const cx = body.x + cos * speed * t;
  const cy = body.y + sin * speed * t;
  const half = Math.max(0, body.size.length / 2 - body.size.width / 2);
  const a = clamp((x - cx) * cos + (y - cy) * sin, -half, half);
  return Math.hypot(x - (cx + cos * a), y - (cy + sin * a)) - body.size.width / 2;
}

export function botInput(state: GameState, racer: Racer, grid: Grid, bodies: Body[]): Input {
  const speed = racer.vx * Math.cos(racer.heading) + racer.vy * Math.sin(racer.heading);

  // Keep track of which stretch of the route we are on.
  for (let tries = 0; tries < 3; tries += 1) {
    const here = project(racer.waypoint, racer.x, racer.y);
    const next = project(racer.waypoint + 1, racer.x, racer.y);
    if (here.t >= here.length - 3 || next.distance + 2 < here.distance) racer.waypoint = (racer.waypoint + 1) % ROUTE.length;
    else break;
  }

  if (racer.reverseTicks > 0) {
    racer.reverseTicks -= 1;
    return { throttle: -1, steer: racer.shift > 0 ? 1 : -1, boost: false, honk: racer.reverseTicks % 30 === 0 };
  }

  const here = project(racer.waypoint, racer.x, racer.y);
  const lookahead = 7 + Math.max(0, speed) * 0.55;
  const target = along(racer.waypoint, here.t, lookahead);

  // Who might be in the way.
  const nearby: number[] = [];
  grid.near(racer.x, racer.y, lookahead + 10, (index) => {
    if (index < state.npcs.length) nearby.push(index);
  });

  let best = 0;
  let bestCost = Infinity;
  for (const shift of SHIFTS) {
    const cx = target.x - target.dy * shift;
    const cy = target.y + target.dx * shift;
    let cost = Math.abs(shift) * 0.5 + Math.abs(shift - racer.shift) * 0.35;
    const distance = Math.hypot(cx - racer.x, cy - racer.y);
    for (let k = 1; k <= 6 && cost < 1000; k += 1) {
      const f = k / 6;
      const x = racer.x + (cx - racer.x) * f;
      const y = racer.y + (cy - racer.y) * f;
      const surface = surfaceAt(GROUND, x, y);
      if (isSolid(surface) || surface === Surface.Water) {
        cost += 1000;
        break;
      }
      cost += SURFACE_COST[surface] ?? 0;
      const t = (distance * f) / Math.max(speed, 6);
      for (const index of nearby) {
        const gap = clearance(bodies[index], state.npcs[index].speed, t, x, y) - 0.45;
        if (gap < 1) cost += (1 - gap) * 45 * (1.2 - f * 0.6);
      }
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = shift;
    }
  }
  racer.shift = best;
  const cx = target.x - target.dy * best;
  const cy = target.y + target.dx * best;
  const turn = angleDiff(racer.heading, Math.atan2(cy - racer.y, cx - racer.x));
  const steer = clamp(turn * 3, -1, 1);

  // Brake for the next corner of the route.
  const now = segment(racer.waypoint);
  const after = segment(racer.waypoint + 1);
  const bend = Math.abs(angleDiff(Math.atan2(now.dy, now.dx), Math.atan2(after.dy, after.dx)));
  const toCorner = here.length - here.t;
  let throttle = 1;
  const cornerSpeed = bend > 0.4 ? CORNER_SPEED * racer.power : Infinity;
  if (speed > cornerSpeed && toCorner < (speed * speed - cornerSpeed * cornerSpeed) / (2 * BRAKING) + 3) throttle = -1;
  if (Math.abs(turn) > 0.9 && speed > 8) throttle = Math.min(throttle, 0.2);
  if (bestCost > 150) throttle = Math.min(throttle, speed > 6 ? -0.6 : 0.4);
  else if (bestCost > 45) throttle = Math.min(throttle, 0.4);

  const honk = bestCost > 30 && racer.honkCooldown <= 0 && random(state) < 0.08;
  const boost = racer.boost >= 0.5 && toCorner > 70 && Math.abs(turn) < 0.2 && bestCost < 20;

  // Stuck against something: back out, then try again.
  if (Math.abs(speed) < 1.5 && racer.crashed === 0) racer.stuck += 1;
  else racer.stuck = Math.max(0, racer.stuck - 2);
  if (racer.stuck > 300) {
    racer.stuck = 0;
    return { throttle: 0, steer: 0, boost: false, honk: false, reset: true };
  }
  if (racer.stuck > 0 && racer.stuck % 100 === 0) racer.reverseTicks = 40;

  return { throttle, steer, boost, honk };
}
