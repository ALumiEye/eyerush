/**
 * Lets bots race the whole course with no player and prints how it went: lap times, crashes, near
 * misses and how long the slowest tick took. Usage: pnpm race [seed] [difficulty]
 */
import { createGame, standings, step } from "../src/core/sim";
import { TICK_RATE } from "../src/core/types";

const seed = Number(process.argv[2] ?? 7);
const difficulty = Number(process.argv[3] ?? 2);
const state = createGame({ seed, bots: 4, difficulty, humans: 0 });
let worst = 0;
const started = performance.now();
const limit = 8 * 60 * TICK_RATE;
while (state.tick < limit && !state.racers.every((r) => r.finishTick >= 0)) {
  const t = performance.now();
  step(state, []);
  worst = Math.max(worst, performance.now() - t);
}
const seconds = (ticks: number) => (ticks / TICK_RATE).toFixed(1);
console.log(`seed ${seed}, difficulty ${difficulty}, ${state.npcs.length} vehicles, ${seconds(state.tick)} s raced`);
for (const id of standings(state)) {
  const r = state.racers[id];
  const time = r.finishTick >= 0 ? `${seconds(r.finishTick - state.startTick)} s` : `lap ${r.lap + 1}, gate ${r.gate}`;
  console.log(`${r.name.padEnd(16)} ${time.padEnd(18)} best lap ${seconds(r.bestLap)} s  crashes ${r.crashes}  near misses ${r.nearMisses}`);
}
console.log(`average tick ${((performance.now() - started) / state.tick).toFixed(3)} ms, slowest ${worst.toFixed(2)} ms`);
