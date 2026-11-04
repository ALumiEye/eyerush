import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import { CITY_H, CITY_W, CORNER, GATES, lightFor, NETWORK } from "../core/city";
import { lanePoint, RACER_SIZE, SIZES } from "../core/traffic";
import { COMMUTE_STOPS, HOME, OFFICE, POLICE_POSTS, POTHOLES } from "../core/commute";
import type { GameEvent, GameState, Racer } from "../core/types";
import { t } from "./i18n";
import { buildTextures, chunks, paintCity, PPM, RACER_COLORS, type Textures, VEHICLE_PPM } from "./textures";

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: number;
  alpha: number;
}

interface Floater {
  text: Text;
  x: number;
  y: number;
  life: number;
}

interface Ring {
  x: number;
  y: number;
  life: number;
  color: number;
}

interface RacerView {
  sprite: Sprite;
  shadow: Sprite;
  name: Text;
  spin: number;
}

/** Draws a race with PixiJS. It reads the state and never changes it. */
export class Renderer {
  private app = new Application();
  private world = new Container();
  private groundLayer = new Container();
  private marks = new Graphics();
  private skids = new Graphics();
  private shadowLayer = new Container();
  private vehicleLayer = new Container();
  private racerLayer = new Container();
  private fx = new Graphics();
  private labelLayer = new Container();
  private overlay = new Graphics();
  private textures!: Textures;
  private npcSprites: Sprite[] = [];
  private npcShadows: Sprite[] = [];
  private racers: RacerView[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private rings: Ring[] = [];
  private skidMarks: { x0: number; y0: number; x1: number; y1: number; life: number }[] = [];
  private camera = { x: 60, y: 16, zoom: 1, ready: false };
  private shake = 0;
  private time = 0;

  async init(host: HTMLElement) {
    await this.app.init({ resizeTo: window, background: "#2b2230", antialias: false, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
    host.append(this.app.canvas);
    this.textures = buildTextures();
    for (const piece of chunks(paintCity())) {
      const sprite = new Sprite(piece.texture);
      sprite.position.set(piece.x, piece.y);
      this.groundLayer.addChild(sprite);
    }
    this.world.addChild(this.groundLayer, this.skids, this.marks, this.shadowLayer, this.vehicleLayer, this.racerLayer, this.fx, this.labelLayer);
    this.app.stage.addChild(this.world, this.overlay);
  }

  /** Builds sprites for a new race. */
  setRace(state: GameState) {
    for (const layer of [this.shadowLayer, this.vehicleLayer, this.racerLayer, this.labelLayer]) layer.removeChildren().forEach((child) => child.destroy());
    this.npcSprites = [];
    this.npcShadows = [];
    this.racers = [];
    this.particles = [];
    this.floaters = [];
    this.rings = [];
    this.skidMarks = [];
    this.camera.ready = false;
    if (state.commute) {
      for (const [point, text] of [[HOME, t().home], [OFFICE, t().office]] as const) {
        const label = new Text({ text, style: { fontFamily: "system-ui, sans-serif", fontSize: 22, fontWeight: "900", fill: "#fff3dc", stroke: { color: "#2b2230", width: 5 } } });
        label.anchor.set(0.5, 1);
        label.position.set(point.x * PPM, (point.y - 5) * PPM);
        this.labelLayer.addChild(label);
      }
      for (const post of POLICE_POSTS) {
        const label = new Text({ text: "CSGT", style: { fontFamily: "system-ui, sans-serif", fontSize: 16, fontWeight: "900", fill: "#ffe4a1", stroke: { color: "#2b2230", width: 4 } } });
        label.anchor.set(0.5, 1);
        label.position.set((post.x + 8) * PPM, (post.y - 8) * PPM);
        this.labelLayer.addChild(label);
      }
    }
    const scale = PPM / VEHICLE_PPM;
    for (const npc of state.npcs) {
      const size = SIZES[npc.kind];
      const shadow = new Sprite(this.textures.shadow);
      shadow.anchor.set(0.5);
      shadow.width = size.length * PPM * 1.02;
      shadow.height = size.width * PPM * 1.05;
      this.shadowLayer.addChild(shadow);
      this.npcShadows.push(shadow);
      const sprite = new Sprite(this.textures.vehicles[npc.kind][npc.look]);
      sprite.anchor.set(0.5);
      sprite.scale.set(scale);
      this.vehicleLayer.addChild(sprite);
      this.npcSprites.push(sprite);
    }
    for (const racer of state.racers) {
      const shadow = new Sprite(this.textures.shadow);
      shadow.anchor.set(0.5);
      shadow.width = RACER_SIZE.length * PPM;
      shadow.height = RACER_SIZE.width * PPM * 1.2;
      this.shadowLayer.addChild(shadow);
      const sprite = new Sprite(this.textures.racers[racer.look % this.textures.racers.length]);
      sprite.anchor.set(0.5);
      sprite.scale.set(scale);
      this.racerLayer.addChild(sprite);
      const name = new Text({
        text: racer.bot ? racer.name : racer.name,
        style: { fontFamily: "system-ui, sans-serif", fontSize: 26, fontWeight: "700", fill: RACER_COLORS[racer.look % RACER_COLORS.length], stroke: { color: "#2b1a2e", width: 6 } },
      });
      name.anchor.set(0.5, 1);
      this.labelLayer.addChild(name);
      this.racers.push({ sprite, shadow, name, spin: 0 });
    }
  }

  get size() {
    return { width: this.app.screen.width, height: this.app.screen.height };
  }

  private particle(p: Partial<Particle> & Pick<Particle, "x" | "y" | "color">) {
    if (this.particles.length > 600) this.particles.shift();
    this.particles.push({ vx: 0, vy: 0, life: 0.5, size: 0.4, grow: 0.5, alpha: 0.8, ...p, max: p.life ?? 0.5 });
  }

  private floater(text: string, x: number, y: number, color: string, size = 30) {
    const label = new Text({
      text,
      style: { fontFamily: "system-ui, sans-serif", fontSize: size, fontWeight: "900", fill: color, stroke: { color: "#2b1a2e", width: 7 } },
    });
    label.anchor.set(0.5);
    this.labelLayer.addChild(label);
    this.floaters.push({ text: label, x, y, life: 1.1 });
    if (this.floaters.length > 12) {
      const old = this.floaters.shift()!;
      old.text.destroy();
    }
  }

  /** Effects for what just happened. `focus` is the racer the camera follows. */
  handle(events: GameEvent[], state: GameState, focus: number) {
    for (const event of events) {
      switch (event.type) {
        case "honk": {
          const racer = state.racers[event.racer];
          this.rings.push({ x: racer.x + Math.cos(racer.heading) * 1.2, y: racer.y + Math.sin(racer.heading) * 1.2, life: 0.5, color: 0xf3d25b });
          if (event.racer === focus) this.floater(t().honk, racer.x, racer.y - 2.5, "#F3D25B", 24);
          break;
        }
        case "crash":
          for (let i = 0; i < 18; i += 1) {
            const a = Math.random() * Math.PI * 2;
            const v = 3 + Math.random() * 8;
            this.particle({ x: event.x, y: event.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.3, size: 0.18, grow: -0.2, color: i % 3 ? 0xffd27a : 0xffffff, alpha: 1 });
          }
          for (let i = 0; i < 8; i += 1) {
            this.particle({ x: event.x, y: event.y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, life: 0.9, size: 0.6, grow: 1.4, color: 0x8a8590, alpha: 0.5 });
          }
          this.racers[event.racer].spin = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 6);
          this.floater(t().crash, event.x, event.y - 2, "#ff6b5a", 34);
          if (event.racer === focus) this.shake = 0.6;
          break;
        case "splash":
          for (let i = 0; i < 24; i += 1) {
            const a = Math.random() * Math.PI * 2;
            const v = 1 + Math.random() * 5;
            this.particle({ x: event.x, y: event.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7, size: 0.3, grow: 0.2, color: 0xcfe9ff, alpha: 0.9 });
          }
          this.rings.push({ x: event.x, y: event.y, life: 0.8, color: 0xcfe9ff });
          this.floater(t().splash, event.x, event.y - 2, "#9fd3ff", 32);
          break;
        case "bump":
          if (event.racer === focus) this.shake = Math.max(this.shake, Math.min(0.35, event.strength / 25));
          for (let i = 0; i < 4; i += 1) {
            this.particle({ x: event.x, y: event.y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, life: 0.25, size: 0.15, grow: 0, color: 0xffe9b0, alpha: 1 });
          }
          break;
        case "nearMiss":
          if (event.racer === focus) {
            const label = event.combo > 1 ? `${t().nearMiss} x${event.combo}` : t().nearMiss;
            this.floater(label, event.x, event.y - 2.5, "#5FC4B8", 26 + Math.min(event.combo, 6) * 2);
          }
          break;
        case "boost": {
          const racer = state.racers[event.racer];
          this.rings.push({ x: racer.x, y: racer.y, life: 0.4, color: 0xeba96b });
          break;
        }
        default:
          break;
      }
    }
  }

  /** Draws the race. `alpha` blends between the last two ticks; `dt` is real seconds since the last frame. */
  draw(state: GameState, alpha: number, focus: number, dt: number) {
    this.time += dt;
    const scale = PPM / VEHICLE_PPM;

    // Traffic.
    for (let i = 0; i < state.npcs.length; i += 1) {
      const npc = state.npcs[i];
      const sprite = this.npcSprites[i];
      if (!sprite) continue;
      const x = lerp(npc.px, npc.x, alpha) * PPM;
      const y = lerp(npc.py, npc.y, alpha) * PPM;
      const heading = lerpAngle(npc.ph, npc.heading, alpha);
      sprite.position.set(x, y);
      sprite.rotation = heading;
      const shadow = this.npcShadows[i];
      shadow.position.set(x + 2, y + 3);
      shadow.rotation = heading;
      // A startled bike wobbles.
      sprite.scale.y = npc.startled > 0 && npc.kind === "bike" ? scale * (1 + Math.sin(this.time * 40) * 0.08) : scale;
    }

    // Racers. Name tags that would pile on top of each other are thinned out.
    const tags: [number, number][] = [];
    for (let i = 0; i < state.racers.length; i += 1) {
      const racer = state.racers[i];
      const view = this.racers[i];
      if (!view) continue;
      const x = lerp(racer.px, racer.x, alpha);
      const y = lerp(racer.py, racer.y, alpha);
      const heading = lerpAngle(racer.ph, racer.heading, alpha);
      view.sprite.position.set(x * PPM, y * PPM);
      if (racer.crashed > 0) {
        view.sprite.rotation += view.spin * dt;
        view.spin *= Math.pow(0.05, dt);
      } else view.sprite.rotation = heading;
      // Lean into the turn: the bike looks narrower as it tips over.
      const riderScale = scale * (i === focus ? 1.3 : 1);
      view.sprite.scale.set(riderScale, riderScale * (1 - Math.abs(racer.steer) * 0.18));
      const detained = Boolean(state.commute?.stoppedTicks);
      view.sprite.alpha = racer.ghost > 0 && !detained ? (Math.floor(this.time * 12) % 2 ? 0.35 : 0.8) : 1;
      view.shadow.position.set(x * PPM + 2, y * PPM + 3);
      view.shadow.rotation = view.sprite.rotation;
      view.name.position.set(x * PPM, y * PPM - 12);
      view.name.scale.set(0.5 / Math.max(0.5, this.world.scale.x));
      const crowded = tags.some(([tx, ty]) => Math.abs(tx - x) < 7 && Math.abs(ty - y) < 2.5);
      view.name.visible = i !== focus && !crowded;
      if (view.name.visible) tags.push([x, y]);

      const speed = Math.hypot(racer.vx, racer.vy);
      const backX = x - Math.cos(heading) * 1.1;
      const backY = y - Math.sin(heading) * 1.1;
      if (racer.boostTicks > 0 && racer.crashed === 0) {
        for (let k = 0; k < 2; k += 1) {
          this.particle({
            x: backX, y: backY,
            vx: -Math.cos(heading) * (6 + Math.random() * 4) + (Math.random() - 0.5) * 2,
            vy: -Math.sin(heading) * (6 + Math.random() * 4) + (Math.random() - 0.5) * 2,
            life: 0.22, size: 0.35, grow: -1, color: k ? 0xffd27a : 0xeba96b, alpha: 0.95,
          });
        }
      } else if (racer.crashed === 0 && racer.throttle > 0 && Math.random() < 0.25) {
        this.particle({ x: backX, y: backY, vx: -Math.cos(heading) * 1.5, vy: -Math.sin(heading) * 1.5, life: 0.5, size: 0.2, grow: 0.8, color: 0xb9b2bf, alpha: 0.35 });
      }
      // Skids when the bike slides sideways.
      const lateral = Math.abs(-racer.vx * Math.sin(racer.heading) + racer.vy * Math.cos(racer.heading));
      if ((lateral > 1.6 || (racer.throttle < 0 && speed > 8)) && racer.crashed === 0) {
        this.skidMarks.push({ x0: racer.px - Math.cos(racer.ph) * 1.1, y0: racer.py - Math.sin(racer.ph) * 1.1, x1: backX, y1: backY, life: 6 });
        if (this.skidMarks.length > 500) this.skidMarks.shift();
      }
    }

    this.drawMarks(state, focus);
    this.drawEffects(dt);
    this.moveCamera(state, focus, alpha, dt);
    this.drawOverlay(state, focus);

    for (const floater of this.floaters) {
      floater.life -= dt;
      floater.y -= dt * 2.2;
      floater.text.position.set(floater.x * PPM, floater.y * PPM);
      floater.text.alpha = Math.min(1, floater.life * 3);
      floater.text.scale.set((0.5 / Math.max(0.5, this.world.scale.x)) * (1 + Math.max(0, floater.life - 0.9) * 2));
    }
    for (const done of this.floaters.filter((f) => f.life <= 0)) done.text.destroy();
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  private drawMarks(state: GameState, focus: number) {
    const g = this.marks;
    g.clear();
    if (state.commute) {
      for (const hole of POTHOLES) {
        const x = hole.x * PPM;
        const y = hole.y * PPM;
        g.ellipse(x, y, hole.rx * PPM, hole.ry * PPM).fill({ color: 0x8d7968 }).stroke({ width: 2, color: 0xc8a77e });
        g.ellipse(x, y + 1, hole.rx * PPM * 0.78, hole.ry * PPM * 0.72).fill({ color: hole.kind === "crater" ? 0x25232b : 0x49404a });
        if (hole.kind === "crater") {
          g.moveTo(x - hole.rx * PPM - 3, y - 3).lineTo(x - hole.rx * PPM - 6, y - 7).stroke({ width: 2, color: 0x49404a });
          g.moveTo(x + hole.rx * PPM, y + 2).lineTo(x + hole.rx * PPM + 5, y + 7).stroke({ width: 2, color: 0x49404a });
        }
      }
      const detainedRider = state.commute.stoppedTicks > 0 ? state.racers[focus] : undefined;
      const officers = detainedRider
        ? [...POLICE_POSTS, { x: detainedRider.x - 5, y: detainedRider.y + 6 }]
        : POLICE_POSTS;
      for (const post of officers) {
        const x = (post.x + 8) * PPM;
        const y = (post.y - 7) * PPM;
        // Khaki uniform, yellow helmet, red baton, and a striped roadside cone.
        g.circle(x, y, 5).fill({ color: 0xf2c878 });
        g.rect(x - 4, y + 4, 8, 10).fill({ color: 0xd4ae71 });
        g.rect(x - 4, y + 14, 3, 5).fill({ color: 0x33303c });
        g.rect(x + 1, y + 14, 3, 5).fill({ color: 0x33303c });
        g.moveTo(x - 4, y + 7).lineTo(x - 11, y + 3).stroke({ width: 3, color: 0xef6b56 });
        g.poly([x + 12, y + 18, x + 17, y + 5, x + 22, y + 18]).fill({ color: 0xef8551 });
        g.moveTo(x + 15, y + 12).lineTo(x + 19, y + 12).stroke({ width: 3, color: 0xfff3dc });
      }
      g.circle(HOME.x * PPM, HOME.y * PPM, 4 * PPM).stroke({ width: 3, color: 0x8ab8dd, alpha: 0.7 });
      g.rect((OFFICE.x - 4) * PPM, (OFFICE.y - 4) * PPM, 8 * PPM, 8 * PPM).fill({ color: 0x5fc4b8, alpha: 0.18 }).stroke({ width: 3, color: 0x5fc4b8 });
    }
    // Stop bars and signal lamps at every lit junction.
    for (const node of NETWORK.nodes) {
      if (!node.light) continue;
      for (const id of node.edges) {
        const edge = NETWORK.edges[id];
        const forward = edge.b === node.id;
        const light = lightFor(node, edge.vertical, state.tick);
        const crossHalf = edge.vertical ? node.halfH : node.halfV;
        const s = edge.length - Math.max(CORNER, crossHalf + 2) + 0.2;
        const a = lanePoint(NETWORK, id, forward, s, 0.3);
        const b = lanePoint(NETWORK, id, forward, s, edge.width / 2 - 0.3);
        const lamp = lanePoint(NETWORK, id, forward, s, edge.width / 2 + 1.2);
        const color = light === "green" ? 0x4bd66b : light === "amber" ? 0xf3c13a : 0xe2453a;
        if (light !== "green") {
          g.moveTo(a.x * PPM, a.y * PPM).lineTo(b.x * PPM, b.y * PPM).stroke({ width: 4, color, alpha: 0.85 });
        }
        g.circle(lamp.x * PPM, lamp.y * PPM, 4.5).fill({ color: 0x1c1a1e });
        g.circle(lamp.x * PPM, lamp.y * PPM, 3).fill({ color });
      }
    }

    // The next gate: a pulsing ring with chevrons pointing the way through.
    const racer = state.racers[focus];
    if (racer && racer.finishTick < 0) {
      const gate = state.commute ? COMMUTE_STOPS[Math.min(state.commute.checkpoint, COMMUTE_STOPS.length - 1)] : GATES[racer.gate];
      const pulse = 1 + Math.sin(this.time * 5) * 0.06;
      g.circle(gate.x * PPM, gate.y * PPM, gate.r * PPM * pulse).stroke({ width: 5, color: 0xeba96b, alpha: 0.85 });
      g.circle(gate.x * PPM, gate.y * PPM, gate.r * PPM * pulse).fill({ color: 0xeba96b, alpha: 0.1 });
      for (let k = -1; k <= 1; k += 1) {
        const cx = gate.x + Math.cos(gate.heading) * k * 3.2;
        const cy = gate.y + Math.sin(gate.heading) * k * 3.2;
        const phase = (this.time * 2 + k * 0.33) % 1;
        this.chevron(g, cx, cy, gate.heading, 2.2, 0xfff3dc, 0.35 + phase * 0.5);
      }
    }

    // Skid marks fade slowly.
    const s = this.skids;
    s.clear();
    for (const mark of this.skidMarks) {
      mark.life -= 1 / 60;
      s.moveTo(mark.x0 * PPM, mark.y0 * PPM).lineTo(mark.x1 * PPM, mark.y1 * PPM).stroke({ width: 2, color: 0x1a161c, alpha: Math.min(0.35, mark.life / 10) });
    }
    this.skidMarks = this.skidMarks.filter((m) => m.life > 0);
  }

  private chevron(g: Graphics, x: number, y: number, heading: number, size: number, color: number, alpha: number) {
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const point = (f: number, side: number) => [(x + cos * f - sin * side) * PPM, (y + sin * f + cos * side) * PPM];
    const [ax, ay] = point(size * 0.5, 0);
    const [bx, by] = point(-size * 0.4, -size * 0.7);
    const [cx, cy] = point(-size * 0.4, size * 0.7);
    g.moveTo(bx, by).lineTo(ax, ay).lineTo(cx, cy).stroke({ width: 5, color, alpha });
  }

  private drawEffects(dt: number) {
    const g = this.fx;
    g.clear();
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.1, dt);
      p.vy *= Math.pow(0.1, dt);
      p.size = Math.max(0.02, p.size + p.grow * dt);
      if (p.life <= 0) continue;
      g.circle(p.x * PPM, p.y * PPM, p.size * PPM).fill({ color: p.color, alpha: p.alpha * (p.life / p.max) });
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const ring of this.rings) {
      ring.life -= dt;
      if (ring.life <= 0) continue;
      const grow = 1 - ring.life / 0.6;
      g.circle(ring.x * PPM, ring.y * PPM, (1 + grow * 6) * PPM).stroke({ width: 3, color: ring.color, alpha: ring.life * 1.5 });
    }
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  private moveCamera(state: GameState, focus: number, alpha: number, dt: number) {
    const racer: Racer | undefined = state.racers[focus];
    if (!racer) return;
    const x = lerp(racer.px, racer.x, alpha);
    const y = lerp(racer.py, racer.y, alpha);
    const speed = Math.hypot(racer.vx, racer.vy);
    // Look ahead in the direction of travel, and pull back a little at speed.
    const targetX = x + racer.vx * 0.55;
    const targetY = y + racer.vy * 0.55;
    const { width, height } = this.size;
    const metresTall = Math.max(30, Math.min(56, (height / width) * 66));
    const baseZoom = height / (metresTall * PPM);
    const targetZoom = baseZoom / (1 + Math.min(1, speed / 26) * 0.28);
    const cam = this.camera;
    if (!cam.ready) {
      cam.x = targetX;
      cam.y = targetY;
      cam.zoom = targetZoom;
      cam.ready = true;
    }
    const follow = 1 - Math.pow(0.004, dt);
    cam.x += (targetX - cam.x) * follow;
    cam.y += (targetY - cam.y) * follow;
    cam.zoom += (targetZoom - cam.zoom) * (1 - Math.pow(0.2, dt));
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const jitter = this.shake * 0.8;
    const sx = (Math.random() - 0.5) * jitter;
    const sy = (Math.random() - 0.5) * jitter;
    // Keep the view inside the city where possible.
    const halfW = width / 2 / (cam.zoom * PPM);
    const halfH = height / 2 / (cam.zoom * PPM);
    const cx = Math.max(halfW, Math.min(CITY_W - halfW, cam.x)) + sx;
    const cy = Math.max(halfH, Math.min(CITY_H - halfH, cam.y)) + sy;
    this.world.scale.set(cam.zoom);
    this.world.position.set(width / 2 - cx * PPM * cam.zoom, height / 2 - cy * PPM * cam.zoom);
  }

  /** An arrow at the edge of the screen when the next gate is out of sight. */
  private drawOverlay(state: GameState, focus: number) {
    const g = this.overlay;
    g.clear();
    const racer = state.racers[focus];
    if (!racer || racer.finishTick >= 0 || state.phase === "countdown") return;
    const gate = state.commute ? COMMUTE_STOPS[Math.min(state.commute.checkpoint, COMMUTE_STOPS.length - 1)] : GATES[racer.gate];
    const zoom = this.world.scale.x;
    const sx = this.world.position.x + gate.x * PPM * zoom;
    const sy = this.world.position.y + gate.y * PPM * zoom;
    const { width, height } = this.size;
    const margin = 40;
    if (sx > margin && sy > margin + 40 && sx < width - margin && sy < height - margin) return;
    const px = this.world.position.x + racer.x * PPM * zoom;
    const py = this.world.position.y + racer.y * PPM * zoom;
    const angle = Math.atan2(sy - py, sx - px);
    // Where the line from the player towards the gate leaves the screen.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tx = cos > 0 ? (width - margin - px) / cos : cos < 0 ? (margin - px) / cos : Infinity;
    const ty = sin > 0 ? (height - margin - py) / sin : sin < 0 ? (margin + 44 - py) / sin : Infinity;
    const k = Math.min(tx, ty);
    const ax = px + cos * k;
    const ay = py + sin * k;
    const size = 18;
    g.poly([
      ax + cos * size, ay + sin * size,
      ax - cos * size * 0.6 - sin * size * 0.8, ay - sin * size * 0.6 + cos * size * 0.8,
      ax - cos * size * 0.6 + sin * size * 0.8, ay - sin * size * 0.6 - cos * size * 0.8,
    ]).fill({ color: 0xeba96b }).stroke({ width: 3, color: 0x3d2141 });
    g.circle(ax - cos * 4, ay - sin * 4, 3).fill({ color: 0x3d2141 });
  }

  /** The direction from a racer to its next gate, for the HUD. */
  static gateBearing(racer: Racer) {
    const gate = GATES[racer.gate];
    return Math.atan2(gate.y - racer.y, gate.x - racer.x);
  }
}

