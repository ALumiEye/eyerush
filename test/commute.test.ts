import { describe, expect, it } from "vitest";
import { GROUND, isSolid, lightFor, MEDIANS, NETWORK, surfaceAt } from "../src/core/city";
import { COMMUTE_STOPS, commuteElapsed, commuteRemaining, crossedRedLight, HOME, OFFICE, POLICE_HOLD_TICKS, POLICE_POSTS, POTHOLES, stepCommute, wrongWayLane } from "../src/core/commute";
import { createGame, step } from "../src/core/sim";
import { NO_INPUT, Surface, TICK_RATE } from "../src/core/types";

function trip() {
  const state = createGame({ mode: "commute", seed: 42, bots: 5, difficulty: 1, traffic: 0 });
  state.npcs = [];
  while (state.tick < state.startTick) step(state, [NO_INPUT]);
  return state;
}

function crossing(police: boolean) {
  const state = trip();
  const node = police ? NETWORK.nodes[POLICE_POSTS[0].nodeId] : NETWORK.nodes.find((n) => n.light && n.x > 16 && !POLICE_POSTS.some((p) => p.nodeId === n.id))!;
  while (lightFor(node, false, state.tick) !== "red") state.tick += 1;
  const r = state.racers[0];
  const stop = Math.max(7, node.halfV + 2) - 0.2;
  r.px = node.x - stop - 0.1;
  r.x = node.x - stop + 0.1;
  r.py = r.y = node.y + 2;
  return { state, node, r };
}

describe("morning commute", () => {
  it("starts one worker at home with a real deadline, not a race grid", () => {
    const state = trip();
    expect(state.racers).toHaveLength(1);
    expect(state.racers[0].bot).toBe(false);
    expect(state.racers[0].x).toBe(HOME.x);
    expect(state.racers[0].y).toBe(HOME.y);
    expect(commuteElapsed(state)).toBe(0);
    expect(commuteRemaining(state)).toBe(150 * TICK_RATE);
  });

  it("keeps home, destinations and hazards on driveable roads", () => {
    for (const p of [HOME, ...COMMUTE_STOPS, ...POTHOLES]) expect(surfaceAt(GROUND, p.x, p.y)).toBe(Surface.Road);
  });

  it("requires ordered route stops and finishes at the office without doing laps", () => {
    const state = trip();
    const r = state.racers[0];
    r.x = OFFICE.x; r.y = OFFICE.y;
    step(state, [NO_INPUT]);
    expect(state.commute!.checkpoint).toBe(0);
    for (const stop of COMMUTE_STOPS) {
      r.x = stop.x; r.y = stop.y;
      step(state, [NO_INPUT]);
    }
    expect(state.phase).toBe("done");
    expect(state.commute!.outcome).toBe("onTime");
    expect(r.lap).toBe(0);
    const snapshot = JSON.stringify(state);
    step(state, [{ ...NO_INPUT, throttle: 1 }]);
    expect(JSON.stringify({ ...state, events: [] })).toBe(JSON.stringify({ ...JSON.parse(snapshot), events: [] }));
  });

  it("ends late at the deadline, even without moving", () => {
    const state = trip();
    state.tick = state.startTick + state.commute!.deadlineTicks - 1;
    step(state, [NO_INPUT]);
    expect(state.phase).toBe("done");
    expect(state.commute!.outcome).toBe("late");
    expect(commuteRemaining(state)).toBe(0);
  });

  it("detects a red stop-line crossing, not merely waiting nearby", () => {
    const { state, node, r } = crossing(false);
    expect(crossedRedLight(r, state.tick)?.id).toBe(node.id);
    r.x = r.px;
    expect(crossedRedLight(r, state.tick)).toBeNull();
    r.x = r.px - 0.1;
    expect(crossedRedLight(r, state.tick)).toBeNull();
  });

  it("does not penalize crossing on green", () => {
    const { state, node, r } = crossing(false);
    while (lightFor(node, false, state.tick) !== "green") state.tick += 1;
    expect(crossedRedLight(r, state.tick)).toBeNull();
    stepCommute(state);
    expect(state.commute!.violations).toBe(0);
  });

  it("detains every red-light runner for five real seconds without double-counting the clock", () => {
    for (const monitored of [true, false]) {
      const { state } = crossing(monitored);
      const before = commuteElapsed(state);
      stepCommute(state);
      expect(state.commute!.notice).toBe("police");
      expect(state.commute!.stoppedTicks).toBe(POLICE_HOLD_TICKS);
      expect(commuteElapsed(state)).toBe(before);
      const r = state.racers[0];
      const [x, y] = [r.x, r.y];
      for (let i = 0; i < POLICE_HOLD_TICKS; i++) {
        step(state, [{ ...NO_INPUT, throttle: 1, boost: true, reset: true }]);
        expect([r.x, r.y]).toEqual([x, y]);
      }
      expect(state.commute!.violations).toBe(1);
      expect(state.commute!.stoppedTicks).toBe(0);
      expect(state.commute!.penaltyTicks).toBe(POLICE_HOLD_TICKS);
      expect(commuteElapsed(state) - before).toBe(POLICE_HOLD_TICKS);
      step(state, [{ ...NO_INPUT, throttle: 1 }]);
      expect(r.vx).toBeGreaterThan(0);
    }
  });

  it("allows the deadline to expire while police hold the rider", () => {
    const { state } = crossing(false);
    state.commute!.deadlineTicks = commuteElapsed(state) + 60;
    stepCommute(state);
    for (let i = 0; i < 60; i++) step(state, [NO_INPUT]);
    expect(state.commute!.outcome).toBe("late");
    expect(state.commute!.stoppedTicks).toBe(POLICE_HOLD_TICKS - 60);
    expect(state.commute!.penaltyTicks).toBe(60);
  });

  it("slows the rider on a pothole only once per encounter", () => {
    const state = trip();
    const hole = POTHOLES.find((h) => h.kind === "pothole")!;
    const r = state.racers[0];
    r.x = r.px = hole.x; r.y = r.py = hole.y; r.vx = 8;
    stepCommute(state);
    expect(state.commute!.potholeHits).toBe(1);
    expect(r.vx).toBeLessThan(8);
    stepCommute(state);
    expect(state.commute!.potholeHits).toBe(1);
  });

  it("throws a fast rider off at a crater but permits careful slow crossing", () => {
    for (const speed of [2, 15]) {
      const state = trip();
      const hole = POTHOLES.find((h) => h.kind === "crater")!;
      const r = state.racers[0];
      r.x = r.px = hole.x; r.y = r.py = hole.y; r.vx = speed;
      stepCommute(state);
      expect(r.crashes).toBe(speed > 9 ? 1 : 0);
      expect(state.commute!.potholeHits).toBe(speed > 9 ? 1 : 0);
    }
  });

  it("penalizes vertical approaches and sidewalk detours, but not remote streets", () => {
    const state = trip();
    const node = NETWORK.nodes[POLICE_POSTS[1].nodeId];
    while (lightFor(node, true, state.tick) !== "red") state.tick += 1;
    const r = state.racers[0];
    const stop = Math.max(7, node.halfH + 2) - 0.2;
    r.py = node.y - stop - 0.1; r.y = node.y - stop + 0.1;
    r.px = r.x = node.x - 6;
    expect(crossedRedLight(r, state.tick)?.id).toBe(node.id);
    r.px = r.x = node.x - 30;
    expect(crossedRedLight(r, state.tick)).toBeNull();
  });

  it("detects police violations through the full movement simulation", () => {
    const { state, r } = crossing(true);
    r.x = r.px;
    r.heading = 0; r.vx = 15; r.vy = 0;
    step(state, [NO_INPUT]);
    expect(state.commute!.violations).toBe(1);
    expect(state.commute!.notice).toBe("police");
  });

  it("does not allow a violation on the deadline to keep the trip alive", () => {
    const { state } = crossing(true);
    state.commute!.deadlineTicks = commuteElapsed(state);
    stepCommute(state);
    expect(state.commute!.outcome).toBe("late");
    expect(state.phase).toBe("done");
  });

  it("makes flower beds solid and leaves junctions and alley mouths open", () => {
    for (const m of MEDIANS) {
      expect(isSolid(surfaceAt(GROUND, (m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2))).toBe(true);
    }
    for (const node of NETWORK.nodes) expect(surfaceAt(GROUND, node.x, node.y)).toBe(Surface.Road);
    for (const [x, y] of [[176, 48], [176, 176], [216, 208], [296, 208]]) {
      expect(surfaceAt(GROUND, x, y)).toBe(Surface.Road);
    }
  });

  it("blocks crossing the median and crashes only on hard impacts", () => {
    for (const speed of [4, 22]) {
      const state = trip(); const r = state.racers[0];
      r.x = 56; r.y = 17.6; r.heading = -Math.PI / 2; r.vx = 0; r.vy = -speed;
      for (let i = 0; i < 20; i++) step(state, [NO_INPUT]);
      expect(r.y).toBeGreaterThanOrEqual(17.45);
      expect(r.crashes).toBe(speed > 12.5 ? 1 : 0);
    }
  });

  it("allows crossing between lanes inside an open junction", () => {
    const state = trip(); const r = state.racers[0];
    r.x = 96; r.y = 19; r.heading = -Math.PI / 2; r.vx = 0; r.vy = -4;
    for (let i = 0; i < 80; i++) step(state, [{ ...NO_INPUT, throttle: 0.3 }]);
    expect(r.y).toBeLessThan(15);
    expect(r.crashes).toBe(0);
    expect(state.commute!.violations).toBe(0);
  });

  it("holds a wrong-way rider then restores the correct lane and heading", () => {
    for (const vertical of [false, true]) {
      const state = trip(); const r = state.racers[0];
      r.x = vertical ? 99 : 56; r.y = vertical ? 112 : 13;
      r.heading = vertical ? Math.PI / 2 : 0;
      r.vx = vertical ? 0 : 5; r.vy = vertical ? 5 : 0;
      const before = { x: r.x, y: r.y };
      stepCommute(state);
      expect(state.commute!.notice).toBe("wrongDirection");
      expect(state.commute!.stoppedTicks).toBe(POLICE_HOLD_TICKS);
      for (let i = 0; i < POLICE_HOLD_TICKS - 1; i++) {
        step(state, [{ ...NO_INPUT, throttle: 1, reset: true, boost: true }]);
        expect({ x: r.x, y: r.y }).toEqual(before);
      }
      step(state, [NO_INPUT]);
      expect(state.commute!.laneRespawn).toBeNull();
      expect(state.commute!.violations).toBe(1);
      expect(surfaceAt(GROUND, r.x, r.y)).toBe(Surface.Road);
      expect(vertical ? r.x < 96 : r.y > 16).toBe(true);
      expect(r.heading).toBeCloseTo(vertical ? Math.PI / 2 : 0);
      expect([r.vx, r.vy]).toEqual([0, 0]);
      step(state, [{ ...NO_INPUT, throttle: 1 }]);
      expect(state.commute!.violations).toBe(1);
    }
  });

  it("does not flag legal lanes, junction turns or slow reverse manoeuvres", () => {
    const state = trip(); const r = state.racers[0];
    for (const [x, y, vx, vy] of [[56, 19, 5, 0], [56, 13, -5, 0], [93, 112, 0, 5], [99, 112, 0, -5], [96, 19, 5, 0], [56, 13, 1, 0], [56, 13, 1, 5]]) {
      Object.assign(r, { x, y, vx, vy });
      expect(wrongWayLane(r)).toBeNull();
    }
  });

  it("replays deterministically with penalties and hazards", () => {
    const a = trip(); const b = trip();
    for (let i = 0; i < 2000; i++) {
      const input = { throttle: 1, steer: i % 900 > 600 ? 0.3 : 0, boost: false, honk: i % 50 === 0 };
      step(a, [input]); step(b, [input]);
    }
    expect(a).toEqual(b);
  });
});
