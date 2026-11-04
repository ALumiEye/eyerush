# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

EyeRush (Phố Đua): a top-down motorbike racing game through rush-hour city traffic, running entirely
in the browser, by ALumiEye. Node.js 22+ and pnpm, Vite, TypeScript, PixiJS 8. All art is drawn by
code and all sound is synthesised with Web Audio — no media files. UI text is Vietnamese/English
(`src/client/i18n.ts`); code and comments are English. Sister project: `../eyetank`, same toolchain.

## Commands

```bash
pnpm dev               # vite dev server, http://localhost:5173
pnpm test              # vitest, the race rules (test/race.test.ts)
pnpm typecheck
pnpm build             # typecheck + web build + single-file dist/eyerush.html
pnpm race [seed] [difficulty]   # bots race headless; prints times, crashes, tick cost
pnpm build && pnpm shot [dir]   # headless Chrome screenshots of menu and race
```

Run `pnpm race` with a few seeds after touching traffic, bots or handling: it is the quickest way to
catch gridlock (bots that never finish) and slow ticks.

## Architecture

- **`src/core`** — the rules, no DOM. Deterministic: use `random(state)` from `rng.ts`, never
  `Math.random()`. Units are metres, m/s and radians (0 = east, y grows south).
  - `city.ts` — the hand-laid map (`STREETS`, park, market), the ground raster (`GROUND`, one
    `Surface` per m²), the traffic network (`NETWORK`: junction nodes and street edges), traffic
    lights (`lightFor`), race `GATES` and the bots' `ROUTE`.
  - `traffic.ts` — city vehicles. Each follows a lane: edge, direction, distance `s` and an offset to
    the right of the centre line; junctions are Bézier curves from `CORNER` metres before to after.
    Car-following, red lights, bikes weaving into gaps, a "pushy" rule that breaks junction
    deadlocks, and `honkAt`. `Grid` is the spatial hash rebuilt every tick.
  - `sim.ts` — `createGame`, `step(state, inputs)`: bike handling (grip per surface, slide, boost),
    wall and vehicle contact, crashes, near misses, slipstream, gates, laps and standings.
  - `bot.ts` — racers that follow `ROUTE`, scoring sideways shifts of a look-ahead point against
    predicted traffic; corner braking, honking, boost, getting unstuck.
- **`src/client`** — reads state, never changes rules. `main.ts` (menus, fixed-timestep loop, HUD,
  minimap, sound triggers), `render.ts` (PixiJS: city chunks, vehicles, lights, effects, camera),
  `textures.ts` (paints the city and every vehicle), `audio.ts`, `input.ts`, `ui.ts`.
