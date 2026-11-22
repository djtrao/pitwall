# Pit Wall

A Formula 1 team-manager game for phones (1–4 players). See [SPEC.md](SPEC.md) for the full plan.
`pitwall.html` is the original single-file prototype (reference only).

**Play / watch:** https://djtrao.github.io/pitwall/ (updates automatically when `main` changes)

## Status

| Milestone | What | State |
| --- | --- | --- |
| 1 | Simulation core + unit tests + balance runner | ✅ done (Sim Lab page to watch AI races) |
| 2 | Single-player race screen | next |
| 3–7 | Duels UI, Hot Lap, season, multiplayer, polish | later |

## Project layout

```
src/sim/        the race engine (pure TypeScript, no browser code – also runs on the server later)
  tuning.ts     ALL balance numbers in one place (defaults = SPEC.md values)
  model.ts      lap time, tyre wear, weather penalties, mistakes, fuel projection
  race.ts       the race loop: createRace(), step(), applyCommand(), results()
  ai.ts         AI pit stops, rain calls, driving modes, duel choices
  weather.ts    rain timeline and forecasts
  tracks.ts     tracks (3 now, 8 in milestone 5)
  teams.ts      fictional AI teams, points
  grid.ts       building the 12-car field, fuel options, stand-in qualifying
src/lab/        "Sim Lab" – a small page to watch a race (milestone 1 only)
tests/          unit tests (Vitest)
scripts/        balance runner and a quick one-race printout
docs/           latest balance report
```

## Commands

You need [Node.js](https://nodejs.org) 22 or newer. Run these in the project folder:

```bash
npm install
```

```bash
npm test
```

```bash
npm run balance -- --quick
```

```bash
npm run dev
```

- `npm install` downloads the tools (once).
- `npm test` runs all unit tests.
- `npm run balance` simulates hundreds of races and prints the section 10 statistics (`--quick` for a fast run, `--only stops,push` for some sections, `--tuning '{"pitLossScale":0.5}'` to try other numbers).
- `npm run dev` starts the Sim Lab on your computer (open the address it prints).
