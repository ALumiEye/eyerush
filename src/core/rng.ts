/** Seeded generator (mulberry32). The state lives in the game, so a race can be replayed exactly. */
export function random(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const between = (state: { rng: number }, low: number, high: number) => low + (high - low) * random(state);

export const angleDiff = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
