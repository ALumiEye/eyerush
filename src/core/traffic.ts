import { CORNER, NETWORK, type Edge, lightFor, type Network } from "./city";
import { between, clamp, random } from "./rng";
import { DT, type GameState, type Npc, type Racer, type VehicleKind } from "./types";

/**
 * The city's own traffic. Every vehicle follows a lane: a street segment, a direction and an
 * offset to the right of the centre line (traffic keeps right). Junctions are driven as smooth
 * curves, lights are obeyed, and each vehicle brakes for whatever is in front of it. Bikes do what
 * bikes do at rush hour: when blocked they look for a gap and squeeze through.
 */

export interface Size {
  length: number;
  width: number;
}

export const SIZES: Record<VehicleKind, Size> = {
  bike: { length: 1.9, width: 0.8 },
  car: { length: 4.2, width: 1.8 },
  bus: { length: 10, width: 2.5 },
  cart: { length: 2.8, width: 1.3 },
};

export const RACER_SIZE: Size = { length: 1.9, width: 0.8 };

const ACCEL: Record<VehicleKind, number> = { bike: 4, car: 3, bus: 1.8, cart: 2.4 };
const CRUISE: Record<VehicleKind, [number, number]> = {
  bike: [8.5, 12],
  car: [9.5, 12.5],
  bus: [8, 9.5],
  cart: [5.5, 7.5],
};
/** How fast a vehicle drifts sideways towards the gap it wants, in metres per second. */
const DRIFT: Record<VehicleKind, number> = { bike: 1.6, car: 0.7, bus: 0.5, cart: 0.9 };

/** How many looks each vehicle kind has, for drawing. */
export const LOOKS: Record<VehicleKind, number> = { bike: 8, car: 6, bus: 2, cart: 3 };

export const LOOK_AHEAD = 15;

interface Point {
  x: number;
  y: number;
}

function endpoints(network: Network, edge: Edge, forward: boolean) {
  const a = network.nodes[edge.a];
  const b = network.nodes[edge.b];
  return forward ? { from: a, to: b } : { from: b, to: a };
}

/** A point in a lane: `s` metres along the segment, `offset` metres to the right of the centre line. */
export function lanePoint(network: Network, edgeId: number, forward: boolean, s: number, offset: number): Point {
  const edge = network.edges[edgeId];
  const { from, to } = endpoints(network, edge, forward);
  const dx = (to.x - from.x) / edge.length;
  const dy = (to.y - from.y) / edge.length;
  return { x: from.x + dx * s - dy * offset, y: from.y + dy * s + dx * offset };
}

function direction(network: Network, edgeId: number, forward: boolean): Point {
  const edge = network.edges[edgeId];
  const { from, to } = endpoints(network, edge, forward);
  return { x: (to.x - from.x) / edge.length, y: (to.y - from.y) / edge.length };
}

/** Where a vehicle is, including the curve through a junction. */
export function placeOf(network: Network, npc: Pick<Npc, "edge" | "forward" | "s" | "offset" | "next" | "nextForward">): Point {
  const edge = network.edges[npc.edge];
  const start = edge.length - CORNER;
  if (npc.s <= start || npc.next < 0) return lanePoint(network, npc.edge, npc.forward, npc.s, npc.offset);
  const t = clamp((npc.s - start) / (2 * CORNER), 0, 1);
  const p0 = lanePoint(network, npc.edge, npc.forward, start, npc.offset);
  const p2 = lanePoint(network, npc.next, npc.nextForward, CORNER, npc.offset);
  const din = direction(network, npc.edge, npc.forward);
  const dout = direction(network, npc.next, npc.nextForward);
  let p1: Point;
  if (Math.abs(din.x * dout.x + din.y * dout.y) > 0.5) p1 = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
  else if (Math.abs(din.x) > 0.5) p1 = { x: p2.x, y: p0.y };
  else p1 = { x: p0.x, y: p2.y };
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/** The range of offsets a vehicle may use on a street of this width. */
export function laneRange(width: number, kind: VehicleKind): [number, number] {
  const half = width / 2;
  const body = SIZES[kind].width / 2;
  if (kind === "bike") return [(width >= 12 ? 1.2 : 0.5) + body, half - 0.4 - body];
  if (kind === "cart") return [half * 0.55, half - 0.5 - body];
  return [half / 2 + 0.2, half / 2 + 0.6];
}

function pickNext(state: GameState, network: Network, npc: Npc) {
  const edge = network.edges[npc.edge];
  const end = npc.forward ? edge.b : edge.a;
  const node = network.nodes[end];
  const choices = node.edges.filter((id) => id !== npc.edge);
  if (choices.length === 0) {
    npc.next = npc.edge;
    npc.nextForward = !npc.forward;
    return;
  }
  // Going straight on is the most common choice.
  const straight = choices.find((id) => network.edges[id].vertical === edge.vertical);
  const id = straight !== undefined && random(state) < 0.5 ? straight : choices[Math.floor(random(state) * choices.length)];
  npc.next = id;
  npc.nextForward = network.edges[id].a === end;
  // Buses keep to the avenues where they can.
  if (npc.kind === "bus" && network.edges[id].kind !== "avenue") {
    const avenue = choices.find((c) => network.edges[c].kind === "avenue");
    if (avenue !== undefined) {
      npc.next = avenue;
      npc.nextForward = network.edges[avenue].a === end;
    }
  }
}

/** Fills the streets with traffic, keeping the start line clear. */
export function spawnTraffic(state: GameState, network: Network = NETWORK, density = 1): Npc[] {
  const npcs: Npc[] = [];
  for (const edge of network.edges) {
    for (const forward of [true, false]) {
      const spacing = (edge.kind === "avenue" ? 8 : 11.5) / density;
      for (let s = CORNER + 2 + random(state) * spacing; s < edge.length - CORNER - 2; s += spacing * between(state, 0.75, 1.25)) {
        const roll = random(state);
        let kind: VehicleKind = roll < 0.74 ? "bike" : roll < 0.87 ? "car" : roll < 0.94 ? "cart" : "bus";
        if (kind === "bus" && edge.kind !== "avenue") kind = "car";
        const [low, high] = laneRange(edge.width, kind);
        const offset = between(state, low, high);
        const npc: Npc = {
          id: npcs.length,
          kind,
          x: 0,
          y: 0,
          heading: 0,
          speed: 0,
          px: 0,
          py: 0,
          ph: 0,
          edge: edge.id,
          forward,
          s,
          next: -1,
          nextForward: true,
          offset,
          targetOffset: offset,
          cruise: between(state, ...CRUISE[kind]),
          startled: 0,
          weave: 0,
          stunned: 0,
          wait: 0,
          pushy: 0,
          missMask: 0,
          look: Math.floor(random(state) * LOOKS[kind]),
        };
        const at = placeOf(network, npc);
        if (Math.hypot(at.x - 72, at.y - 16) < 48) continue;
        pickNext(state, network, npc);
        const dir = direction(network, edge.id, forward);
        npc.x = npc.px = at.x;
        npc.y = npc.py = at.y;
        npc.heading = npc.ph = Math.atan2(dir.y, dir.x);
        npc.speed = npc.cruise * 0.6;
        npcs.push(npc);
      }
    }
  }
  return npcs;
}

/** A coarse grid of who is where, rebuilt every tick, so neighbours are cheap to find. */
export class Grid {
  static CELL = 8;
  readonly cols: number;
  readonly rows: number;
  private heads: Int32Array;
  private nexts = new Int32Array(1024);

  constructor(width: number, height: number) {
    this.cols = Math.ceil(width / Grid.CELL) + 1;
    this.rows = Math.ceil(height / Grid.CELL) + 1;
    this.heads = new Int32Array(this.cols * this.rows);
  }

  private cellOf(x: number, y: number) {
    const cx = clamp(Math.floor(x / Grid.CELL), 0, this.cols - 1);
    const cy = clamp(Math.floor(y / Grid.CELL), 0, this.rows - 1);
    return cy * this.cols + cx;
  }

  /** Items are numbered: vehicles first, then racers after them. */
  rebuild(points: { x: number; y: number }[]) {
    this.heads.fill(-1);
    if (this.nexts.length < points.length) this.nexts = new Int32Array(points.length * 2);
    for (let i = 0; i < points.length; i += 1) {
      const cell = this.cellOf(points[i].x, points[i].y);
      this.nexts[i] = this.heads[cell];
      this.heads[cell] = i;
    }
  }

  near(x: number, y: number, radius: number, visit: (index: number) => void) {
    const x0 = clamp(Math.floor((x - radius) / Grid.CELL), 0, this.cols - 1);
    const x1 = clamp(Math.floor((x + radius) / Grid.CELL), 0, this.cols - 1);
    const y0 = clamp(Math.floor((y - radius) / Grid.CELL), 0, this.rows - 1);
    const y1 = clamp(Math.floor((y + radius) / Grid.CELL), 0, this.rows - 1);
    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        for (let i = this.heads[cy * this.cols + cx]; i >= 0; i = this.nexts[i]) visit(i);
      }
    }
  }
}

/** One body on the road, as the traffic sees it. */
export interface Body {
  x: number;
  y: number;
  heading: number;
  size: Size;
}

export function bodyOfNpc(npc: Npc): Body {
  return { x: npc.x, y: npc.y, heading: npc.heading, size: SIZES[npc.kind] };
}

export function bodyOfRacer(racer: Racer): Body {
  return { x: racer.x, y: racer.y, heading: racer.heading, size: RACER_SIZE };
}

/** Moves all traffic one tick. `bodies` holds every vehicle then every racer, indexed like the grid. */
export function stepTraffic(state: GameState, grid: Grid, bodies: Body[], network: Network = NETWORK) {
  const count = state.npcs.length;
  for (const npc of state.npcs) {
    npc.px = npc.x;
    npc.py = npc.y;
    npc.ph = npc.heading;
    const edge = network.edges[npc.edge];
    const size = SIZES[npc.kind];
    let desired = npc.cruise;

    // Lights: stop at the line unless already over it, or too close to stop on amber.
    let held = false;
    const endId = npc.forward ? edge.b : edge.a;
    const end = network.nodes[endId];
    if (end.light) {
      const crossHalf = edge.vertical ? end.halfH : end.halfV;
      const stopLine = edge.length - Math.max(CORNER, crossHalf + 2) - 0.6 - size.length / 2;
      const gap = stopLine - npc.s;
      if (gap > -0.3) {
        const light = lightFor(end, edge.vertical, state.tick);
        const tooClose = light === "amber" && gap < npc.speed * 0.7;
        if (light !== "green" && !tooClose) {
          desired = Math.min(desired, Math.max(0, gap * 1.1));
          held = gap < 3;
        }
      }
    }

    // Whatever is ahead in the lane.
    const cos = Math.cos(npc.heading);
    const sin = Math.sin(npc.heading);
    let blocked = false;
    grid.near(npc.x, npc.y, LOOK_AHEAD, (index) => {
      if (index === npc.id) return;
      const other = bodies[index];
      const rx = other.x - npc.x;
      const ry = other.y - npc.y;
      const along = rx * cos + ry * sin;
      if (along <= 0 || along > LOOK_AHEAD) return;
      const side = Math.abs(-rx * sin + ry * cos);
      // A body turned across the lane is as wide as it is long.
      const across = Math.abs(Math.sin(other.heading - npc.heading));
      // After a long wait, a vehicle noses through anything crossing its path, as everyone does.
      if (npc.pushy > 0 && across > 0.5 && index < count) return;
      const otherHalf = (other.size.width * (1 - across) + other.size.length * across) / 2;
      if (side > size.width / 2 + otherHalf + 0.3) return;
      const otherDepth = (other.size.length * (1 - across) + other.size.width * across) / 2;
      const gap = along - size.length / 2 - otherDepth;
      const limit = Math.max(0, (gap - 1.1) * 1.7);
      if (limit < desired) desired = limit;
      if (gap < 7) blocked = true;
      // Never ram a racer from behind: the city is busy, not cruel.
      if (index >= count && gap < 1.5) desired = 0;
    });

    if (npc.weave > 0) npc.weave -= 1;
    if (blocked && npc.weave <= 0 && (npc.kind === "bike" || npc.kind === "cart")) {
      const [low, high] = laneRange(edge.width, npc.kind);
      npc.targetOffset = between(state, low, high);
      npc.weave = 40 + Math.floor(random(state) * 60);
    }
    if (npc.startled > 0) npc.startled -= 1;
    if (npc.pushy > 0) npc.pushy -= 1;
    if (npc.speed < 0.3 && desired < 0.3 && !held) npc.wait += 1;
    else npc.wait = 0;
    if (npc.wait > 120) {
      npc.wait = 0;
      npc.pushy = 100;
    }

    if (npc.stunned > 0) {
      npc.stunned -= 1;
      npc.speed = Math.max(0, npc.speed - 20 * DT);
    } else if (npc.speed < desired) npc.speed = Math.min(desired, npc.speed + ACCEL[npc.kind] * DT);
    else npc.speed = Math.max(desired, npc.speed - 10 * DT);

    const drift = DRIFT[npc.kind] * (npc.startled > 0 ? 2.2 : 1) * DT;
    npc.offset += clamp(npc.targetOffset - npc.offset, -drift, drift);

    npc.s += npc.speed * DT;
    if (npc.s >= edge.length + CORNER) {
      npc.s -= edge.length;
      npc.edge = npc.next;
      npc.forward = npc.nextForward;
      const next = network.edges[npc.edge];
      const [low, high] = laneRange(next.width, npc.kind);
      npc.targetOffset = clamp(npc.targetOffset, low, high);
      pickNext(state, network, npc);
    }
    const at = placeOf(network, npc);
    const dx = at.x - npc.x;
    const dy = at.y - npc.y;
    if (dx * dx + dy * dy > 1e-6) npc.heading = Math.atan2(dy, dx);
    npc.x = at.x;
    npc.y = at.y;
    bodies[npc.id].x = npc.x;
    bodies[npc.id].y = npc.y;
    bodies[npc.id].heading = npc.heading;
  }
}

/** Startles traffic in front of a honking racer: bikes swerve out of the way, cars edge aside. */
export function honkAt(state: GameState, racer: Racer, grid: Grid, network: Network = NETWORK) {
  const cos = Math.cos(racer.heading);
  const sin = Math.sin(racer.heading);
  grid.near(racer.x, racer.y, 20, (index) => {
    if (index >= state.npcs.length) return;
    const npc = state.npcs[index];
    const rx = npc.x - racer.x;
    const ry = npc.y - racer.y;
    const along = rx * cos + ry * sin;
    const side = -rx * sin + ry * cos;
    if (along < 0 || along > 20 || Math.abs(side) > 3 + along * 0.35) return;
    // Which side of the vehicle the racer is on, in the vehicle's own frame.
    const ncos = Math.cos(npc.heading);
    const nsin = Math.sin(npc.heading);
    const racerSide = (racer.x - npc.x) * -nsin + (racer.y - npc.y) * ncos;
    const edge = network.edges[npc.edge];
    const [low, high] = laneRange(edge.width, npc.kind);
    const push = npc.kind === "bike" ? 2.4 : npc.kind === "cart" ? 1.5 : 0.6;
    npc.targetOffset = clamp(npc.offset + (racerSide > 0 ? -push : push), low, high);
    if (npc.kind === "bike" || npc.kind === "cart") npc.weave = 90;
    npc.startled = 60;
  });
}
