/**
 * The shared shapes of the game. Distances are in metres, speeds in metres per second, angles in
 * radians with 0 pointing east and y growing southwards (screen coordinates).
 */

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const LAPS = 3;
export const COUNTDOWN_TICKS = 3 * TICK_RATE;
/** How long the race keeps going for the others once the player is home. */
export const FINISH_GRACE_TICKS = 20 * TICK_RATE;

/** What the ground is made of, one value per square metre of the city. */
export const enum Surface {
  Building = 0,
  Road = 1,
  Sidewalk = 2,
  Alley = 3,
  Grass = 4,
  Water = 5,
  Market = 6,
  Path = 7,
  Stall = 8,
}

export interface Input {
  /** 1 full throttle, -1 full brake (and reverse once stopped). */
  throttle: number;
  /** -1 left, 1 right. */
  steer: number;
  boost: boolean;
  honk: boolean;
  /** Put the bike back on the road at the last safe spot. */
  reset?: boolean;
}

export const NO_INPUT: Input = { throttle: 0, steer: 0, boost: false, honk: false };

export type VehicleKind = "bike" | "car" | "bus" | "cart";

/** One of the city's own vehicles, driving its lane and minding the lights. */
export interface Npc {
  id: number;
  kind: VehicleKind;
  x: number;
  y: number;
  heading: number;
  speed: number;
  /** Where it was last tick, for smooth drawing between ticks. */
  px: number;
  py: number;
  ph: number;
  /** The street segment it is on, and whether it drives from the segment's a end to its b end. */
  edge: number;
  forward: boolean;
  /** Distance along the segment from the starting node, in its driving direction. */
  s: number;
  /** The segment it turns into at the end of this one. */
  next: number;
  nextForward: boolean;
  /** Offset to the right of the street's centre line, and where it is drifting to. */
  offset: number;
  targetOffset: number;
  cruise: number;
  /** Ticks left of being startled by a horn. */
  startled: number;
  /** Ticks until a weaving bike may pick a new gap. */
  weave: number;
  /** Ticks left of being stopped dead after a crash. */
  stunned: number;
  /** Ticks spent stopped by other traffic (not by a light). */
  wait: number;
  /** Ticks left of nosing through crossing traffic after waiting too long. */
  pushy: number;
  /** One bit per racer that already got a near miss off this vehicle. */
  missMask: number;
  /** Livery index, for drawing. */
  look: number;
}

export interface Racer {
  id: number;
  name: string;
  bot: boolean;
  /** Bots drive a little slower or faster than the player depending on difficulty. */
  power: number;
  look: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  px: number;
  py: number;
  ph: number;
  /** The last steering input, for drawing the lean. */
  steer: number;
  throttle: number;
  boost: number;
  boostTicks: number;
  crashed: number;
  /** Ticks of passing through traffic after getting back up. */
  ghost: number;
  honkCooldown: number;
  /** Laps finished, and the next gate to pass. */
  lap: number;
  gate: number;
  finishTick: number;
  lapStartTick: number;
  bestLap: number;
  safeX: number;
  safeY: number;
  safeHeading: number;
  combo: number;
  comboTimer: number;
  nearMisses: number;
  crashes: number;
  /** Bot memory. */
  waypoint: number;
  shift: number;
  stuck: number;
  reverseTicks: number;
  drown: boolean;
}

export type GameEvent =
  | { type: "honk"; racer: number; x: number; y: number }
  | { type: "crash"; racer: number; x: number; y: number; hard: boolean }
  | { type: "splash"; racer: number; x: number; y: number }
  | { type: "bump"; racer: number; x: number; y: number; strength: number }
  | { type: "nearMiss"; racer: number; x: number; y: number; combo: number }
  | { type: "boost"; racer: number }
  | { type: "gate"; racer: number }
  | { type: "lap"; racer: number; lap: number; time: number }
  | { type: "finish"; racer: number; place: number; time: number }
  | { type: "count"; value: number };

export type Phase = "countdown" | "race" | "done";

export interface GameState {
  tick: number;
  rng: number;
  phase: Phase;
  /** Tick the race started on (the end of the countdown). */
  startTick: number;
  /** Tick the race closes for everyone, once the player has finished. */
  closeTick: number;
  laps: number;
  racers: Racer[];
  npcs: Npc[];
  events: GameEvent[];
  finishers: number[];
}
