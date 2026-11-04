import { Surface } from "./types";

/**
 * The city: a hand-laid grid of streets with a lake park, a covered market and narrow alleys.
 * Everything else (the ground raster, the traffic network, the race route) is built from this
 * description once, so the browser, the tests and the bots all agree about the streets.
 */

export const CITY_W = 336;
export const CITY_H = 224;
/** Sidewalk depth on each side of a street. */
export const SIDEWALK = 3;
/** Radius of the curve a vehicle drives through a junction. */
export const CORNER = 7;

export type StreetKind = "avenue" | "street" | "alley";

export interface Street {
  /** Vertical streets keep x fixed; horizontal ones keep y fixed. */
  vertical: boolean;
  /** The fixed coordinate, and the span along the street. */
  at: number;
  from: number;
  to: number;
  width: number;
  kind: StreetKind;
  name: string;
}

const avenue = (vertical: boolean, at: number, from: number, to: number, name: string): Street => ({
  vertical, at, from, to, width: 12, kind: "avenue", name,
});
const street = (vertical: boolean, at: number, from: number, to: number, name: string): Street => ({
  vertical, at, from, to, width: 10, kind: "street", name,
});
const alley = (vertical: boolean, at: number, from: number, to: number, name: string): Street => ({
  vertical, at, from, to, width: 4, kind: "alley", name,
});

// Street names are invented, in the style of an old quarter.
export const STREETS: Street[] = [
  avenue(false, 16, 16, 320, "Phố Hàng Gió"),
  street(false, 80, 16, 320, "Phố Hàng Mây"),
  street(false, 144, 16, 256, "Phố Hàng Nắng"),
  avenue(false, 208, 16, 320, "Đường Bờ Sông"),
  avenue(true, 16, 16, 208, "Phố Cửa Ô"),
  street(true, 96, 16, 208, "Phố Hàng Diều"),
  avenue(true, 176, 16, 208, "Phố Hàng Trống Cơm"),
  street(true, 256, 16, 208, "Phố Hàng Quạt Giấy"),
  street(true, 320, 16, 208, "Phố Cầu Gỗ"),
  alley(false, 48, 96, 176, "Ngõ Con Mèo"),
  alley(true, 216, 144, 208, "Ngõ Bà Tám"),
  alley(false, 176, 96, 176, "Ngõ Chợ"),
  alley(true, 56, 80, 144, "Ngõ Hoa Sữa"),
  alley(true, 296, 80, 208, "Ngõ Đèn Lồng"),
];

/** Raised two-metre flower beds, with openings at every road and alley junction. */
export const MEDIANS = STREETS.filter((s) => s.kind === "avenue").flatMap((s) => {
  const spans: { x0: number; y0: number; x1: number; y1: number; vertical: boolean }[] = [];
  let start = -1;
  for (let t = s.from; t <= s.to; t += 1) {
    const open = t === s.to || STREETS.some((cross) =>
      cross.vertical !== s.vertical && s.at >= cross.from && s.at <= cross.to &&
      t >= cross.at - cross.width / 2 - 4 && t < cross.at + cross.width / 2 + 4);
    if (!open && start < 0) start = t;
    if (open && start >= 0) {
      spans.push(s.vertical
        ? { x0: s.at - 1, y0: start, x1: s.at + 1, y1: t, vertical: true }
        : { x0: start, y0: s.at - 1, x1: t, y1: s.at + 1, vertical: false });
      start = -1;
    }
  }
  return spans;
});

/** The lake park and the market fill two whole blocks. */
export const PARK = { x0: 96, y0: 80, x1: 176, y1: 144, lake: { x: 136, y: 112, rx: 22, ry: 13 } };
export const MARKET = { x0: 96, y0: 144, x1: 176, y1: 208 };

/** Gates the racers must pass, in order. Gate 0 is the start and finish line. */
export interface Gate {
  x: number;
  y: number;
  r: number;
  /** Direction of travel through the gate. */
  heading: number;
}

export const GATES: Gate[] = [
  { x: 56, y: 19, r: 10, heading: 0 },
  { x: 256, y: 52, r: 9, heading: Math.PI / 2 },
  { x: 216, y: 208, r: 10, heading: Math.PI },
  { x: 19, y: 112, r: 10, heading: -Math.PI / 2 },
];

/** The bots follow the right-hand lanes, staying clear of raised medians. */
export const ROUTE: [number, number][] = [
  [56, 19],
  [253, 19],
  [253, 52],
  [253, 205],
  [216, 205],
  [19, 205],
  [19, 112],
  [19, 19],
];

export const insideCity = (x: number, y: number) => x >= 0 && y >= 0 && x < CITY_W && y < CITY_H;

/** Builds the ground raster: one Surface per square metre. */
export function buildGround(): Uint8Array {
  const ground = new Uint8Array(CITY_W * CITY_H).fill(Surface.Building);
  const fill = (x0: number, y0: number, x1: number, y1: number, surface: Surface) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(CITY_H, Math.ceil(y1)); y += 1) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(CITY_W, Math.ceil(x1)); x += 1) {
        ground[y * CITY_W + x] = surface;
      }
    }
  };
  const rect = (s: Street, half: number, extend: number, surface: Surface) => {
    if (s.vertical) fill(s.at - half, s.from - extend, s.at + half, s.to + extend, surface);
    else fill(s.from - extend, s.at - half, s.to + extend, s.at + half, surface);
  };

  // The park: grass, a ring path and the lake.
  fill(PARK.x0, PARK.y0, PARK.x1, PARK.y1, Surface.Grass);
  const { lake } = PARK;
  for (let y = PARK.y0; y < PARK.y1; y += 1) {
    for (let x = PARK.x0; x < PARK.x1; x += 1) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const d = Math.hypot((cx - lake.x) / lake.rx, (cy - lake.y) / lake.ry);
      if (d < 1) ground[y * CITY_W + x] = Surface.Water;
      else {
        const ring = Math.hypot((cx - lake.x) / (lake.rx + 6), (cy - lake.y) / (lake.ry + 6));
        if (ring > 0.88 && ring < 1.02) ground[y * CITY_W + x] = Surface.Path;
      }
    }
  }
  // Two paths from the ring out to the corners of the park, so it can be crossed.
  for (let i = 0; i <= 120; i += 1) {
    const t = i / 120;
    const paths: [number, number, number, number][] = [
      [PARK.x0 + 6, PARK.y0 + 6, lake.x - lake.rx - 4, lake.y - 6],
      [PARK.x1 - 6, PARK.y1 - 6, lake.x + lake.rx + 4, lake.y + 6],
    ];
    for (const [ax, ay, bx, by] of paths) {
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      fill(x - 1, y - 1, x + 1, y + 1, Surface.Path);
    }
  }

  // The market: stalls in rows with narrow aisles between them.
  fill(MARKET.x0, MARKET.y0, MARKET.x1, MARKET.y1, Surface.Market);
  for (let y = MARKET.y0; y < MARKET.y1; y += 1) {
    for (let x = MARKET.x0; x < MARKET.x1; x += 1) {
      const u = (x - MARKET.x0 - 10 + 70) % 7;
      const v = (y - MARKET.y0 - 10 + 70) % 7;
      if (u < 4 && v < 4) ground[y * CITY_W + x] = Surface.Stall;
    }
  }

  for (const s of STREETS) if (s.kind !== "alley") rect(s, s.width / 2 + SIDEWALK, s.width / 2 + SIDEWALK, Surface.Sidewalk);
  for (const s of STREETS) if (s.kind === "alley") rect(s, s.width / 2, 0, Surface.Alley);
  for (const s of STREETS) if (s.kind !== "alley") rect(s, s.width / 2, s.width / 2, Surface.Road);
  for (const m of MEDIANS) fill(m.x0, m.y0, m.x1, m.y1, Surface.Median);
  return ground;
}

export const surfaceAt = (ground: Uint8Array, x: number, y: number): Surface =>
  insideCity(x, y) ? (ground[Math.floor(y) * CITY_W + Math.floor(x)] as Surface) : Surface.Building;

export const isSolid = (surface: Surface) => surface === Surface.Building || surface === Surface.Stall || surface === Surface.Median;

/** A junction in the traffic network. */
export interface Node {
  id: number;
  x: number;
  y: number;
  edges: number[];
  /** Junctions where three or more streets meet have traffic lights. */
  light: boolean;
  /** Half the road width of the horizontal and the vertical street, for stop lines. */
  halfH: number;
  halfV: number;
  /** Shifts each junction's light cycle so they do not all change together. */
  phaseOffset: number;
}

/** A stretch of street between two junctions, driven in both directions. */
export interface Edge {
  id: number;
  a: number;
  b: number;
  vertical: boolean;
  length: number;
  width: number;
  kind: StreetKind;
}

export interface Network {
  nodes: Node[];
  edges: Edge[];
}

/** Links every street (not the alleys) into junctions and segments. */
export function buildNetwork(): Network {
  const roads = STREETS.filter((s) => s.kind !== "alley");
  const nodes: Node[] = [];
  const nodeAt = (x: number, y: number) => {
    let node = nodes.find((n) => n.x === x && n.y === y);
    if (!node) {
      node = { id: nodes.length, x, y, edges: [], light: false, halfH: 0, halfV: 0, phaseOffset: 0 };
      nodes.push(node);
    }
    return node;
  };
  for (const v of roads.filter((s) => s.vertical)) {
    for (const h of roads.filter((s) => !s.vertical)) {
      if (v.at >= h.from && v.at <= h.to && h.at >= v.from && h.at <= v.to) {
        const node = nodeAt(v.at, h.at);
        node.halfH = h.width / 2;
        node.halfV = v.width / 2;
      }
    }
  }
  const edges: Edge[] = [];
  for (const s of roads) {
    const on = nodes
      .filter((n) => (s.vertical ? n.x === s.at && n.y >= s.from && n.y <= s.to : n.y === s.at && n.x >= s.from && n.x <= s.to))
      .sort((p, q) => (s.vertical ? p.y - q.y : p.x - q.x));
    for (let i = 0; i + 1 < on.length; i += 1) {
      const a = on[i];
      const b = on[i + 1];
      const edge: Edge = {
        id: edges.length,
        a: a.id,
        b: b.id,
        vertical: s.vertical,
        length: Math.hypot(b.x - a.x, b.y - a.y),
        width: s.width,
        kind: s.kind,
      };
      edges.push(edge);
      a.edges.push(edge.id);
      b.edges.push(edge.id);
    }
  }
  for (const node of nodes) {
    node.light = node.edges.length >= 3;
    node.phaseOffset = (node.id * 211) % 600;
  }
  return { nodes, edges };
}

export const LIGHT_GREEN = 8 * 60;
export const LIGHT_AMBER = 2 * 60;
const LIGHT_CYCLE = 2 * (LIGHT_GREEN + LIGHT_AMBER);

export type Light = "green" | "amber" | "red";

/** The light shown to traffic on a horizontal (or vertical) street at a junction. */
export function lightFor(node: Node, vertical: boolean, tick: number): Light {
  if (!node.light) return "green";
  const t = (tick + node.phaseOffset) % LIGHT_CYCLE;
  const half = LIGHT_GREEN + LIGHT_AMBER;
  const own = vertical ? (t + half) % LIGHT_CYCLE : t;
  if (own < LIGHT_GREEN) return "green";
  if (own < half) return "amber";
  return "red";
}

/** Total length of the bots' route around the course. */
export function routeLength() {
  let total = 0;
  for (let i = 0; i < ROUTE.length; i += 1) {
    const [ax, ay] = ROUTE[i];
    const [bx, by] = ROUTE[(i + 1) % ROUTE.length];
    total += Math.hypot(bx - ax, by - ay);
  }
  return total;
}

export const GROUND = buildGround();
export const NETWORK = buildNetwork();
