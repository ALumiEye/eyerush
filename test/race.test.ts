import { describe, expect, it } from "vitest";
import { GATES, GROUND, isSolid, lightFor, NETWORK, ROUTE, surfaceAt } from "../src/core/city";
import { createGame, CRASH_SPEED, standings, stateHash, step } from "../src/core/sim";
import { laneRange, placeOf } from "../src/core/traffic";
import { type GameState, type Input, NO_INPUT, Surface, TICK_RATE } from "../src/core/types";

const GO: Input = { throttle: 1, steer: 0, boost: false, honk: false };

function run(state: GameState, ticks: number, input: Input = NO_INPUT) {
  for (let i = 0; i < ticks; i += 1) step(state, [input]);
  return state;
}

/** A race with no traffic and no bots: just the player on an empty city. */
function emptyCity() {
  const state = createGame({ seed: 1, bots: 0, difficulty: 1 });
  state.npcs = [];
  return run(state, state.startTick);
}

describe("city", () => {
  it("puts every gate and every corner of the bots' route on open road", () => {
    for (const gate of GATES) expect(surfaceAt(GROUND, gate.x, gate.y)).toBe(Surface.Road);
    for (const [x, y] of ROUTE) expect(surfaceAt(GROUND, x, y)).toBe(Surface.Road);
  });

  it("joins every street into one connected network", () => {
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length) {
      const node = NETWORK.nodes[queue.pop()!];
      for (const id of node.edges) {
        const edge = NETWORK.edges[id];
        for (const next of [edge.a, edge.b]) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
    }
    expect(seen.size).toBe(NETWORK.nodes.length);
  });

  it("keeps every lane on the road", () => {
    for (const edge of NETWORK.edges) {
      for (const forward of [true, false]) {
        const [low, high] = laneRange(edge.width, "bike");
        for (const offset of [low, high]) {
          const at = placeOf(NETWORK, { edge: edge.id, forward, s: edge.length / 2, offset, next: -1, nextForward: true });
          expect(surfaceAt(GROUND, at.x, at.y)).toBe(Surface.Road);
        }
      }
    }
  });

  it("never shows green both ways at a junction", () => {
    const node = NETWORK.nodes.find((n) => n.light)!;
    for (let tick = 0; tick < 3000; tick += 7) {
      const across = lightFor(node, false, tick);
      const down = lightFor(node, true, tick);
      expect(across === "green" && down === "green").toBe(false);
    }
  });
});

describe("race", () => {
  it("replays exactly from the same seed and inputs", () => {
    const a = run(createGame({ seed: 42, bots: 3, difficulty: 1 }), 900, GO);
    const b = run(createGame({ seed: 42, bots: 3, difficulty: 1 }), 900, GO);
    expect(stateHash(a)).toBe(stateHash(b));
  });

  it("holds everyone on the grid during the countdown", () => {
    const state = createGame({ seed: 3, bots: 3, difficulty: 1 });
    const start = state.racers.map((r) => [r.x, r.y]);
    run(state, state.startTick - 1, GO);
    expect(state.phase).toBe("countdown");
    expect(state.racers.map((r) => [r.x, r.y])).toEqual(start);
    run(state, 1, GO);
    expect(state.phase).toBe("race");
  });

  it("throws the rider off when riding into a wall at speed", () => {
    const state = emptyCity();
    const me = state.racers[0];
    // Point straight at the buildings north of the avenue.
    me.heading = -Math.PI / 2;
    me.vx = 0;
    me.vy = -(CRASH_SPEED + 4);
    run(state, 30, GO);
    expect(me.crashes).toBe(1);
  });

  it("lets a rider scrape a wall gently without falling", () => {
    const state = emptyCity();
    const me = state.racers[0];
    me.heading = -Math.PI / 2;
    me.vx = 0;
    me.vy = -4;
    run(state, 60, { ...GO, throttle: 0.2 });
    expect(me.crashes).toBe(0);
  });

  it("puts a rider who falls in the lake back on the road", () => {
    const state = emptyCity();
    const me = state.racers[0];
    me.safeX = 56;
    me.safeY = 16;
    me.x = 136;
    me.y = 112;
    run(state, 2, GO);
    expect(me.drown).toBe(true);
    run(state, 120);
    expect(surfaceAt(GROUND, me.x, me.y)).toBe(Surface.Road);
    expect(me.ghost).toBeGreaterThan(0);
  });

  it("counts a lap only after every gate in order", () => {
    const state = emptyCity();
    const me = state.racers[0];
    const visit = (gate: number) => {
      me.x = GATES[gate].x;
      me.y = GATES[gate].y;
      run(state, 1);
    };
    visit(2);
    visit(0);
    expect(me.lap).toBe(0);
    visit(1);
    visit(2);
    visit(3);
    visit(0);
    expect(me.lap).toBe(1);
  });

  it("charges the boost on a near miss and spends it on a boost", () => {
    const state = createGame({ seed: 5, bots: 0, difficulty: 1 });
    run(state, state.startTick);
    const me = state.racers[0];
    const npc = state.npcs[0];
    npc.stunned = 1000;
    me.boost = 0;
    // Ride past the vehicle with a hand's width to spare.
    const side = 0.4 + 0.45 + 0.3;
    me.x = npc.x - Math.cos(npc.heading) * 3 - Math.sin(npc.heading) * side;
    me.y = npc.y - Math.sin(npc.heading) * 3 + Math.cos(npc.heading) * side;
    me.heading = npc.heading;
    me.vx = Math.cos(npc.heading) * 20;
    me.vy = Math.sin(npc.heading) * 20;
    run(state, 20, GO);
    expect(me.nearMisses).toBeGreaterThan(0);
    expect(me.boost).toBeGreaterThan(0);
    me.boost = 1;
    run(state, 1, { ...GO, boost: true });
    expect(me.boostTicks).toBeGreaterThan(0);
    expect(me.boost).toBeLessThan(0.05);
  });

  it("makes bikes ahead move aside when honked at", () => {
    const state = createGame({ seed: 8, bots: 0, difficulty: 1 });
    run(state, state.startTick);
    const me = state.racers[0];
    const bike = state.npcs.find((n) => n.kind === "bike")!;
    me.x = bike.x - Math.cos(bike.heading) * 8;
    me.y = bike.y - Math.sin(bike.heading) * 8;
    me.heading = bike.heading;
    run(state, 1, { ...NO_INPUT, honk: true });
    expect(bike.startled).toBeGreaterThan(0);
    expect(bike.targetOffset).not.toBe(bike.offset);
  });

  it("stops traffic at a red light", () => {
    const state = createGame({ seed: 11, bots: 0, difficulty: 1 });
    run(state, 30 * TICK_RATE);
    // Everything waiting just short of a junction must be facing a light that is not green.
    let waiting = 0;
    for (const npc of state.npcs) {
      if (npc.speed > 0.05) continue;
      const edge = NETWORK.edges[npc.edge];
      const end = NETWORK.nodes[npc.forward ? edge.b : edge.a];
      if (!end.light || npc.s > edge.length - 6 || npc.s < edge.length - 20) continue;
      waiting += 1;
    }
    expect(waiting).toBeGreaterThan(0);
  });

  it("keeps traffic out of the buildings", () => {
    const state = createGame({ seed: 13, bots: 2, difficulty: 1, humans: 0 });
    for (let i = 0; i < 40 * TICK_RATE; i += 1) {
      step(state, []);
      if (i % 30 !== 0) continue;
      for (const npc of state.npcs) expect(isSolid(surfaceAt(GROUND, npc.x, npc.y))).toBe(false);
    }
  });

  it("lets bots finish a race through rush-hour traffic without gridlock", () => {
    const state = createGame({ seed: 21, bots: 4, difficulty: 1, humans: 0, laps: 2 });
    while (state.phase !== "done" && state.tick < 4 * 60 * TICK_RATE) step(state, []);
    expect(state.phase).toBe("done");
    expect(state.finishers).toHaveLength(4);
    expect(standings(state)).toEqual(state.finishers);
  });
});
