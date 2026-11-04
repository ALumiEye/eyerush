import { Texture } from "pixi.js";
import { CITY_H, CITY_W, GATES, GROUND, MARKET, NETWORK, PARK, SIDEWALK, STREETS } from "../core/city";
import type { VehicleKind } from "../core/types";
import { Surface } from "../core/types";
import { LOOKS, SIZES } from "../core/traffic";

/** Ground pixels per metre. Vehicles are drawn at twice this for crisper detail. */
export const PPM = 8;
export const VEHICLE_PPM = 16;

export const BRAND = {
  cream: "#EFE3CC",
  plum: "#59325D",
  plumDark: "#3D2141",
  orange: "#EBA96B",
  pink: "#F2B3AE",
};

/** Racer liveries: the player is ALumiEye orange. */
export const RACER_COLORS = ["#EBA96B", "#F2B3AE", "#5FC4B8", "#F3D25B", "#8FC66B", "#7FA7E8"];

/** Small fixed-seed hash, so every load draws the same city. */
const hash = (x: number, y: number, seed = 0) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const rgb = (color: string): [number, number, number] => {
  const n = Number.parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const ROOFS = ["#b5583c", "#c96a48", "#8c5a3c", "#4f7f9e", "#4c8c84", "#a49e98", "#d8c8a8", "#6d8f4e", "#9b4a3f", "#c9b48f"];
const TIN = new Set([3, 4, 7, 2]);
const SIGNS = ["#d33b2c", "#f1c232", "#2f6fb2", "#3c9a5a", "#EBA96B", "#F2B3AE", "#e05d8a", "#ffffff"];
const TARPS = ["#d94f3d", "#2f7fc1", "#f0b43c", "#3fa55b", "#e2734a", "#8a5bb0"];

const ground = (x: number, y: number): Surface =>
  x < 0 || y < 0 || x >= CITY_W || y >= CITY_H ? Surface.Building : (GROUND[y * CITY_W + x] as Surface);
const solid = (s: Surface) => s === Surface.Building;

/** Lots: each block is cut into narrow tube houses, deeper than they are wide. */
const lotOf = (x: number, y: number) => {
  const lx = Math.floor((x + Math.floor(hash(0, Math.floor(y / 9), 5) * 5)) / 5);
  const ly = Math.floor(y / 9);
  return { lx, ly, pick: hash(lx, ly, 1) };
};

/** Paints the whole city once onto a canvas, PPM pixels per metre. */
export function paintCity(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CITY_W * PPM;
  canvas.height = CITY_H * PPM;
  const g = canvas.getContext("2d")!;
  const image = g.createImageData(canvas.width, canvas.height);
  const data = image.data;

  const marketStall = (x: number, y: number) => ({
    sx: Math.floor((x - MARKET.x0 - 10 + 70) / 7),
    sy: Math.floor((y - MARKET.y0 - 10 + 70) / 7),
  });

  for (let py = 0; py < canvas.height; py += 1) {
    const y = Math.floor(py / PPM);
    for (let px = 0; px < canvas.width; px += 1) {
      const x = Math.floor(px / PPM);
      const surface = ground(x, y);
      const n = hash(px, py, 9) - 0.5;
      let r = 0;
      let gr = 0;
      let b = 0;
      let k = 1;
      switch (surface) {
        case Surface.Building: {
          const lot = lotOf(x, y);
          const roof = Math.floor(lot.pick * ROOFS.length);
          [r, gr, b] = rgb(ROOFS[roof]);
          const fx = (px + Math.floor(hash(0, Math.floor(y / 9), 5) * 5) * PPM) % (5 * PPM);
          const fy = py % (9 * PPM);
          if (fx === 0 || fy === 0) k = 0.62;
          else if (TIN.has(roof) && fy % 3 === 0) k = 0.88;
          else if (!TIN.has(roof) && (fx + fy) % 4 === 0) k = 0.92;
          k += n * 0.05;
          break;
        }
        case Surface.Road:
          [r, gr, b] = [76, 71, 82];
          k = 1 + n * 0.12;
          break;
        case Surface.Sidewalk:
          [r, gr, b] = [200, 184, 158];
          k = (px % PPM === 0 || py % PPM === 0 ? 0.86 : 1) + n * 0.06;
          if (hash(Math.floor(px / PPM), Math.floor(py / PPM), 3) < 0.12) k *= 0.94;
          break;
        case Surface.Alley:
          [r, gr, b] = [150, 140, 132];
          k = 1 + n * 0.14;
          break;
        case Surface.Grass:
          [r, gr, b] = [104, 152, 72];
          k = 1 + n * 0.22 + (hash(Math.floor(px / 3), Math.floor(py / 3), 4) < 0.08 ? -0.15 : 0);
          break;
        case Surface.Water: {
          [r, gr, b] = [63, 127, 168];
          const wave = Math.sin(px * 0.35 + Math.sin(py * 0.12) * 3 + py * 0.05);
          k = 1 + (wave > 0.93 ? 0.22 : 0) + n * 0.05;
          break;
        }
        case Surface.Path:
          [r, gr, b] = [215, 196, 156];
          k = 1 + n * 0.1;
          break;
        case Surface.Market:
          [r, gr, b] = [185, 165, 130];
          k = 1 + n * 0.1;
          break;
        case Surface.Stall: {
          const { sx, sy } = marketStall(x, y);
          [r, gr, b] = rgb(TARPS[Math.floor(hash(sx, sy, 7) * TARPS.length)]);
          const stripe = Math.floor((px + py) / 6) % 2 === 0;
          k = stripe ? 1.08 : 0.9;
          const ex = (x - MARKET.x0 - 10 + 70) % 7;
          const ey = (y - MARKET.y0 - 10 + 70) % 7;
          if ((ex === 0 && px % PPM < 1) || (ey === 0 && py % PPM < 1) || (ex === 3 && px % PPM === PPM - 1) || (ey === 3 && py % PPM === PPM - 1)) k = 0.6;
          break;
        }
      }
      const i = (py * canvas.width + px) * 4;
      data[i] = Math.max(0, Math.min(255, r * k));
      data[i + 1] = Math.max(0, Math.min(255, gr * k));
      data[i + 2] = Math.max(0, Math.min(255, b * k));
      data[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);

  // Shop signs along every frontage, and shadows cast by the buildings onto the street.
  for (let y = 0; y < CITY_H; y += 1) {
    for (let x = 0; x < CITY_W; x += 1) {
      const here = ground(x, y);
      if (solid(here)) {
        const lot = lotOf(x, y);
        const color = SIGNS[Math.floor(hash(lot.lx, lot.ly, 2) * SIGNS.length)];
        g.fillStyle = color;
        if (!solid(ground(x, y + 1)) && ground(x, y + 1) !== Surface.Stall) g.fillRect(x * PPM, y * PPM + PPM - 3, PPM, 3);
        if (!solid(ground(x, y - 1)) && ground(x, y - 1) !== Surface.Stall) g.fillRect(x * PPM, y * PPM, PPM, 3);
        if (!solid(ground(x + 1, y)) && ground(x + 1, y) !== Surface.Stall) g.fillRect(x * PPM + PPM - 3, y * PPM, 3, PPM);
        if (!solid(ground(x - 1, y)) && ground(x - 1, y) !== Surface.Stall) g.fillRect(x * PPM, y * PPM, 3, PPM);
      } else {
        g.fillStyle = "rgba(20, 10, 30, 0.22)";
        if (solid(ground(x, y - 1))) g.fillRect(x * PPM, y * PPM, PPM, 5);
        if (solid(ground(x - 1, y))) g.fillRect(x * PPM, y * PPM, 4, PPM);
      }
    }
  }

  // Rooftop clutter: water tanks and air conditioners.
  for (let y = 0; y < CITY_H; y += 3) {
    for (let x = 0; x < CITY_W; x += 3) {
      if (!solid(ground(x, y)) || !solid(ground(x + 1, y + 1))) continue;
      const roll = hash(x, y, 11);
      if (roll < 0.05) {
        g.fillStyle = "#e9edf0";
        g.beginPath();
        g.arc(x * PPM + PPM, y * PPM + PPM, PPM * 0.8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#b6c0c8";
        g.fillRect(x * PPM + PPM - 4, y * PPM + PPM - 1, 8, 2);
      } else if (roll < 0.1) {
        g.fillStyle = "#d9d6d0";
        g.fillRect(x * PPM + 2, y * PPM + 2, 9, 7);
        g.fillStyle = "#8f8a84";
        g.fillRect(x * PPM + 4, y * PPM + 4, 5, 3);
      }
    }
  }

  // Lane markings, crossings and stop lines.
  for (const edge of NETWORK.edges) {
    const a = NETWORK.nodes[edge.a];
    const b = NETWORK.nodes[edge.b];
    const startCut = (edge.vertical ? a.halfH : a.halfV) + 3.5;
    const endCut = (edge.vertical ? b.halfH : b.halfV) + 3.5;
    const length = edge.length - startCut - endCut;
    const dx = (b.x - a.x) / edge.length;
    const dy = (b.y - a.y) / edge.length;
    const at = (s: number, side: number) => [(a.x + dx * s - dy * side) * PPM, (a.y + dy * s + dx * side) * PPM];
    if (edge.kind === "avenue") {
      g.fillStyle = "#e8c547";
      for (const side of [-0.18, 0.18]) {
        const [x0, y0] = at(startCut, side);
        const [x1, y1] = at(startCut + length, side);
        g.fillRect(Math.min(x0, x1) - 1, Math.min(y0, y1) - 1, Math.abs(x1 - x0) + 2, Math.abs(y1 - y0) + 2);
      }
    } else {
      g.fillStyle = "rgba(240, 236, 228, 0.85)";
      for (let s = startCut; s < startCut + length - 2; s += 6) {
        const [x0, y0] = at(s, 0);
        const [x1, y1] = at(Math.min(s + 3, startCut + length), 0);
        g.fillRect(Math.min(x0, x1) - 1, Math.min(y0, y1) - 1, Math.abs(x1 - x0) + 2, Math.abs(y1 - y0) + 2);
      }
    }
    // Zebra crossings at the lit end of each segment.
    for (const [node, from, cut] of [
      [a, 0, startCut],
      [b, edge.length, endCut],
    ] as const) {
      if (!node.light) continue;
      const half = edge.width / 2;
      const towards = from === 0 ? 1 : -1;
      g.fillStyle = "rgba(240, 236, 228, 0.82)";
      for (let side = -half + 0.5; side < half - 0.4; side += 1) {
        const s0 = from + towards * (cut - 3);
        const s1 = from + towards * (cut - 0.6);
        const [x0, y0] = at(s0, side);
        const [x1, y1] = at(s1, side + 0.55);
        g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      }
    }
  }

  // Start and finish line.
  const start = GATES[0];
  const startStreet = STREETS[0];
  for (let i = 0; i < startStreet.width; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      g.fillStyle = (i + j) % 2 === 0 ? "#f4f0e6" : "#262026";
      g.fillRect((start.x - 1 + j) * PPM, (start.y - startStreet.width / 2 + i) * PPM, PPM, PPM);
    }
  }

  // Street trees on the sidewalks, and trees in the park.
  const tree = (x: number, y: number, size: number, seed: number) => {
    const cx = x * PPM;
    const cy = y * PPM;
    g.fillStyle = "rgba(20, 30, 10, 0.28)";
    g.beginPath();
    g.arc(cx + 3, cy + 4, size * PPM, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = hash(seed, 1, 12) < 0.5 ? "#3e7a3a" : "#4f8a3c";
    g.beginPath();
    g.arc(cx, cy, size * PPM, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(170, 220, 120, 0.45)";
    for (let i = 0; i < 4; i += 1) {
      g.beginPath();
      g.arc(cx + (hash(seed, i, 13) - 0.6) * size * PPM, cy + (hash(seed, i, 14) - 0.6) * size * PPM, size * PPM * 0.35, 0, Math.PI * 2);
      g.fill();
    }
  };
  let seed = 0;
  for (const s of STREETS) {
    if (s.kind === "alley") continue;
    for (const side of [-1, 1]) {
      for (let t = s.from + 4; t < s.to - 2; t += 9) {
        const nearJunction = NETWORK.nodes.some((n) => Math.hypot((s.vertical ? s.at : t) - n.x, (s.vertical ? t : s.at) - n.y) < s.width / 2 + 9);
        if (nearJunction || hash(t, side, s.at) < 0.25) continue;
        const off = side * (s.width / 2 + SIDEWALK / 2);
        const x = s.vertical ? s.at + off : t;
        const y = s.vertical ? t : s.at + off;
        if (ground(Math.floor(x), Math.floor(y)) !== Surface.Sidewalk) continue;
        tree(x, y, 1.6, (seed += 1));
      }
    }
  }
  for (let y = PARK.y0 + 4; y < PARK.y1 - 3; y += 5) {
    for (let x = PARK.x0 + 4; x < PARK.x1 - 3; x += 5) {
      const jx = x + hash(x, y, 15) * 3;
      const jy = y + hash(x, y, 16) * 3;
      if (ground(Math.floor(jx), Math.floor(jy)) !== Surface.Grass || hash(x, y, 17) < 0.45) continue;
      const clear = [-2, 2].every((dx) => [-2, 2].every((dy) => ground(Math.floor(jx + dx), Math.floor(jy + dy)) === Surface.Grass));
      if (clear) tree(jx, jy, 1.4 + hash(x, y, 18), (seed += 1));
    }
  }
  // A small red bridge onto an island pavilion in the lake.
  const { lake } = PARK;
  g.fillStyle = "#b8452f";
  g.fillRect((lake.x - 1) * PPM, (lake.y + 2) * PPM, 2 * PPM, (lake.ry - 2) * PPM);
  g.fillStyle = "#6e8f4a";
  g.beginPath();
  g.ellipse(lake.x * PPM, lake.y * PPM, 5 * PPM, 3.5 * PPM, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#c9a24a";
  g.fillRect((lake.x - 2) * PPM, (lake.y - 2) * PPM, 4 * PPM, 3 * PPM);
  g.fillStyle = "#8c3a2a";
  g.fillRect((lake.x - 2.4) * PPM, (lake.y - 2.4) * PPM, 4.8 * PPM, 1.2 * PPM);
  return canvas;
}

/** Cuts a big canvas into textures small enough for any GPU. */
export function chunks(canvas: HTMLCanvasElement, size = 1024) {
  const out: { texture: Texture; x: number; y: number }[] = [];
  for (let y = 0; y < canvas.height; y += size) {
    for (let x = 0; x < canvas.width; x += size) {
      const piece = document.createElement("canvas");
      piece.width = Math.min(size, canvas.width - x);
      piece.height = Math.min(size, canvas.height - y);
      piece.getContext("2d")!.drawImage(canvas, -x, -y);
      const texture = Texture.from(piece);
      texture.source.scaleMode = "nearest";
      out.push({ texture, x, y });
    }
  }
  return out;
}

type Paint = (g: CanvasRenderingContext2D, w: number, h: number) => void;

function canvasTexture(width: number, height: number, paint: Paint): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  paint(g, width, height);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
}

const round = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
};

const BIKE_COLORS = ["#c0392b", "#2c3e50", "#ecf0f1", "#2980b9", "#8e44ad", "#16a085", "#d35400", "#7f8c8d"];
const SHIRTS = ["#3b5ba5", "#e8e1d0", "#c8553d", "#5b8c5a", "#d9a441", "#7a4f9a", "#444444", "#e27d9b"];
const HELMETS = ["#f1c40f", "#e74c3c", "#ffffff", "#3498db", "#2ecc71", "#e67e22", "#9b59b6", "#1abc9c"];
const CAR_COLORS = ["#e9e6df", "#c0392b", "#2c3e50", "#95a5a6", "#2e86c1", "#d4ac0d"];
const BUS_COLORS = ["#2e9d5b", "#e2a72e"];

/** A bike from above, facing east: wheels, tank, rider and helmet. */
function paintBike(g: CanvasRenderingContext2D, w: number, h: number, body: string, shirt: string, helmet: string, racer = false) {
  const m = h / 2;
  g.fillStyle = "#1d1a1f";
  round(g, 0, m - 1.5, 7, 3, 1.5);
  round(g, w - 7, m - 1.5, 7, 3, 1.5);
  g.fillStyle = body;
  round(g, 5, m - 3, w - 11, 6, 3);
  g.fillStyle = "#2a2528";
  round(g, 8, m - 2, 9, 4, 2);
  // Handlebar and mirrors.
  g.fillStyle = "#3a3438";
  g.fillRect(w - 9, 1, 2, h - 2);
  g.fillStyle = "#c9d3da";
  g.fillRect(w - 8, 0, 2, 2);
  g.fillRect(w - 8, h - 2, 2, 2);
  // Rider: shoulders, arms to the bars, helmet.
  g.fillStyle = shirt;
  round(g, 8, 1.5, 9, h - 3, 4);
  g.fillRect(14, 2, w - 22, 2);
  g.fillRect(14, h - 4, w - 22, 2);
  g.fillStyle = helmet;
  g.beginPath();
  g.arc(14.5, m, 3.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.fillRect(16.5, m - 2, 1.5, 4);
  if (racer) {
    g.fillStyle = "#ffffff";
    g.fillRect(11, m - 0.75, 6, 1.5);
  }
}

function paintCar(g: CanvasRenderingContext2D, w: number, h: number, color: string) {
  g.fillStyle = "#1d1a1f";
  for (const x of [8, w - 16]) {
    g.fillRect(x, 0, 8, 2);
    g.fillRect(x, h - 2, 8, 2);
  }
  g.fillStyle = color;
  round(g, 1, 1.5, w - 2, h - 3, 7);
  g.fillStyle = "rgba(255,255,255,0.18)";
  round(g, 18, 5, w - 32, h - 10, 4);
  g.fillStyle = "#2b3a4a";
  round(g, w - 22, 4, 8, h - 8, 3);
  round(g, 9, 5, 6, h - 10, 2);
  g.fillStyle = "#fff4c2";
  g.fillRect(w - 3, 3, 2, 4);
  g.fillRect(w - 3, h - 7, 2, 4);
  g.fillStyle = "#b03a2e";
  g.fillRect(1, 3, 2, 4);
  g.fillRect(1, h - 7, 2, 4);
}

function paintBus(g: CanvasRenderingContext2D, w: number, h: number, color: string) {
  g.fillStyle = color;
  round(g, 0, 0, w, h, 5);
  g.fillStyle = "#f1efe8";
  round(g, 6, 5, w - 18, h - 10, 3);
  g.fillStyle = "#c9c6bd";
  for (let x = 16; x < w - 20; x += 26) g.fillRect(x, h / 2 - 5, 12, 10);
  g.fillStyle = "#2b3a4a";
  g.fillRect(w - 9, 3, 6, h - 6);
  g.fillStyle = "#fff4c2";
  g.fillRect(w - 2, 3, 2, 5);
  g.fillRect(w - 2, h - 8, 2, 5);
}

function paintCart(g: CanvasRenderingContext2D, w: number, h: number, look: number) {
  const m = h / 2;
  paintBike(g, 20, h, "#5c6b73", SHIRTS[look % SHIRTS.length], HELMETS[(look + 3) % HELMETS.length]);
  // The cargo bed sits in front, piled with whatever is being delivered.
  g.fillStyle = "#6b4a2f";
  g.fillRect(18, 1, w - 18, h - 2);
  const loads = [
    ["#c49a6c", "#a87c50", "#d9b48a"],
    ["#e8e1d0", "#d4cbb8", "#bfb59f"],
    ["#4f9a4a", "#e0453a", "#f1c232"],
  ][look % 3];
  for (let i = 0; i < 6; i += 1) {
    g.fillStyle = loads[i % 3];
    const bx = 19 + (i % 3) * ((w - 20) / 3);
    const by = i < 3 ? 2 : m;
    g.fillRect(bx, by, (w - 20) / 3 - 1, m - 2);
  }
}

export interface Textures {
  vehicles: Record<VehicleKind, Texture[]>;
  racers: Texture[];
  shadow: Texture;
  dot: Texture;
}

export function buildTextures(): Textures {
  const size = (kind: VehicleKind) => [Math.round(SIZES[kind].length * VEHICLE_PPM), Math.round(SIZES[kind].width * VEHICLE_PPM)] as const;
  const make = (kind: VehicleKind, paint: (g: CanvasRenderingContext2D, w: number, h: number, look: number) => void) =>
    Array.from({ length: LOOKS[kind] }, (_, look) => canvasTexture(...size(kind), (g, w, h) => paint(g, w, h, look)));
  const [bw, bh] = size("bike");
  return {
    vehicles: {
      bike: make("bike", (g, w, h, look) => paintBike(g, w, h, BIKE_COLORS[look], SHIRTS[(look * 3) % 8], HELMETS[(look * 5) % 8])),
      car: make("car", (g, w, h, look) => paintCar(g, w, h, CAR_COLORS[look])),
      bus: make("bus", (g, w, h, look) => paintBus(g, w, h, BUS_COLORS[look])),
      cart: make("cart", paintCart),
    },
    racers: RACER_COLORS.map((color, i) =>
      canvasTexture(bw + 2, bh + 2, (g) => {
        g.translate(1, 1);
        paintBike(g, bw, bh, color, i === 0 ? BRAND.plum : "#3d3342", color, true);
      }),
    ),
    shadow: canvasTexture(32, 16, (g) => {
      g.fillStyle = "rgba(15, 5, 25, 0.35)";
      round(g, 0, 0, 32, 16, 7);
    }),
    dot: canvasTexture(8, 8, (g) => {
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(4, 4, 4, 0, Math.PI * 2);
      g.fill();
    }),
  };
}

/** The ALumiEye orange bike, for the favicon. */
export function iconUrl() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d")!;
  g.fillStyle = BRAND.plum;
  g.beginPath();
  g.roundRect(0, 0, 64, 64, 14);
  g.fill();
  g.translate(32, 32);
  g.rotate(-Math.PI / 2);
  g.scale(1.6, 1.6);
  g.translate(-15, -7);
  paintBike(g, 30, 14, BRAND.orange, BRAND.cream, BRAND.orange, true);
  return canvas.toDataURL();
}

